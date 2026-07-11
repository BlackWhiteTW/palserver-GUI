import * as k8s from "@kubernetes/client-node";
import fs from "node:fs";
import { PassThrough } from "node:stream";
import type { InstanceStats, InstanceStatus, LogSource, LogSourceId } from "@palserver/shared";
import type { ServerDriver, DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";

/**
 * k8s backend driver.
 *
 * Drives a PalServer running as a StatefulSet (e.g. the thijsvanloef/palworld-server image)
 * via @kubernetes/client-node. The agent may run either in-cluster (a Pod with a service
 * account) or out-of-cluster (~/.kube/config, or an explicit kubeconfig path for SSH-tunnel
 * scenarios). Lifecycle is expressed as StatefulSet replica scaling: start = scale to 1,
 * stop = scale to 0. We never delete the StatefulSet — that preserves the PVC (saves).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function strategicMergeMiddleware(): any {
  // Strategic-merge-patch content-type is required for scale subresource patches
  // so the API server merges `spec.replicas` instead of replacing the whole scale
  // object. Ported from PalworldManager k8s-controller.ts.
  //
  // @kubernetes/client-node 1.x 的 ObservableAPI pipe 鏈透過 rxjsStub.mergeMap
  // 呼叫 callback(value).toPromise()。httpApi.send() 回傳 Observable（有 toPromise），
  // 但 middleware 的 pre/post 如果回傳裸 Promise 就會 TypeError。用 of() 包一層
  // Observable-like（帶 toPromise 方法）即可相容。
  const of = (value: unknown) => ({ toPromise: () => Promise.resolve(value) });
  return {
    pre: (ctx: { setHeaderParam: (k: string, v: string) => void }) => {
      ctx.setHeaderParam("Content-Type", "application/strategic-merge-patch+json");
      return of(ctx);
    },
    post: (ctx: unknown) => of(ctx),
  };
}

/**
 * Load a kubeconfig with a precedence that covers all agent deployment shapes:
 *   1. PALSERVER_KUBECONFIG env → explicit file (SSH-tunnel / admin-supplied path)
 *   2. in-cluster service account (agent runs as a Pod)
 *   3. ~/.kube/config default (out-of-cluster dev/ops)
 */
export function loadKubeConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  const kubeconfigPath = process.env.PALSERVER_KUBECONFIG;
  if (kubeconfigPath && fs.existsSync(kubeconfigPath)) {
    kc.loadFromFile(kubeconfigPath);
    return kc;
  }
  try {
    kc.loadFromCluster();
    return kc;
  } catch {
    // not in a Pod — fall through to default kubeconfig
  }
  kc.loadFromDefault();
  return kc;
}

/** Find the first Pod backing a StatefulSet via its `app=<sts>` label. */
export async function findPodName(
  coreApi: k8s.CoreV1Api,
  namespace: string,
  statefulSet: string,
): Promise<string | null> {
  const pods = await coreApi.listNamespacedPod({
    namespace,
    labelSelector: `app=${statefulSet}`,
  });
  return pods.items[0]?.metadata?.name ?? null;
}

export const k8sDriver: ServerDriver = {
  async status(rec, _ctx): Promise<{ status: InstanceStatus; runtimeId: string | null }> {
    const namespace = rec.k8sNamespace!;
    const statefulSet = rec.k8sStatefulSet!;
    const kc = loadKubeConfig();
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);

    try {
      const sts = await appsApi.readNamespacedStatefulSet({
        name: statefulSet,
        namespace,
      });
      const replicas = sts.spec?.replicas ?? 0;
      const ready = sts.status?.readyReplicas ?? 0;
      const updated = sts.status?.updatedReplicas ?? 0;
      const generation = sts.metadata?.generation ?? 0;
      const observedGeneration = sts.status?.observedGeneration ?? 0;
      const revisionChanged = Boolean(
        sts.status?.currentRevision &&
          sts.status?.updateRevision &&
          sts.status.currentRevision !== sts.status.updateRevision,
      );

      if (replicas === 0) {
        return { status: "exited", runtimeId: null };
      }
      if (
        ready < replicas ||
        updated < replicas ||
        observedGeneration < generation ||
        revisionChanged
      ) {
        return { status: "starting", runtimeId: null };
      }
      // running — surface the backing Pod name as the runtime id
      const podName = await findPodName(coreApi, namespace, statefulSet);
      return { status: "running", runtimeId: podName };
    } catch {
      // StatefulSet missing / API unreachable — treat as not materialized.
      return { status: "missing", runtimeId: null };
    }
  },

  async start(rec, _ctx): Promise<void> {
    const namespace = rec.k8sNamespace!;
    const statefulSet = rec.k8sStatefulSet!;
    const kc = loadKubeConfig();
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const patch = { spec: { replicas: 1 } };
    await appsApi.patchNamespacedStatefulSetScale(
      { name: statefulSet, namespace, body: patch },
      { middleware: [strategicMergeMiddleware()] } as unknown as k8s.Configuration,
    );
  },

  async stop(rec, _ctx): Promise<void> {
    const namespace = rec.k8sNamespace!;
    const statefulSet = rec.k8sStatefulSet!;
    const kc = loadKubeConfig();
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const patch = { spec: { replicas: 0 } };
    await appsApi.patchNamespacedStatefulSetScale(
      { name: statefulSet, namespace, body: patch },
      { middleware: [strategicMergeMiddleware()] } as unknown as k8s.Configuration,
    );
  },

  async remove(rec, ctx): Promise<void> {
    // Scale down only — never delete the StatefulSet, so the PVC (saves) survive.
    await this.stop(rec, ctx);
  },

  async stats(rec, _ctx): Promise<InstanceStats | null> {
    // k8s 下透過 exec 讀容器的 cgroup 與 /proc 取記憶體與運行時間。
    // CPU 因難以從單次取樣推算百分比，暫不提供（前端顯示 —）。
    const namespace = rec.k8sNamespace!;
    const stsName = rec.k8sStatefulSet!;
    const kc = loadKubeConfig();
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);

    const podName = await findPodName(coreApi, namespace, stsName);
    if (!podName) return null;

    try {
      // 記憶體：cgroup v2 的 memory.current（bytes）；v1 fallback 到 memory.usage_in_bytes
      let memoryBytes = 0;
      try {
        const memOut = await execInPod(rec, ["sh", "-c",
          "cat /sys/fs/cgroup/memory.current 2>/dev/null || cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null || echo 0"]);
        memoryBytes = Number(memOut.trim()) || 0;
      } catch { /* best-effort */ }

      // uptime：從 /proc/uptime 的第一欄（秒）
      let uptimeSeconds: number | undefined;
      try {
        const upOut = await execInPod(rec, ["sh", "-c", "cut -d' ' -f1 /proc/uptime"]);
        uptimeSeconds = Math.round(Number(upOut.trim()) || 0);
      } catch { /* best-effort */ }

      return {
        cpuPercent: 0,
        cpuCores: 1,
        memoryBytes,
        memoryLimitBytes: 0,
        uptimeSeconds,
      } satisfies InstanceStats;
    } catch {
      return null;
    }
  },

  async streamLogs(
    rec,
    _ctx,
    onLine: (line: string) => void,
    onEnd: () => void,
    _source?: LogSourceId,
  ): Promise<() => void> {
    const namespace = rec.k8sNamespace!;
    const statefulSet = rec.k8sStatefulSet!;
    const kc = loadKubeConfig();
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);

    const podName = await findPodName(coreApi, namespace, statefulSet);
    if (!podName) {
      onEnd();
      return () => {};
    }

    // k8s.Log writes the followed log stream into the supplied Writable and
    // resolves to an AbortController we use for cleanup on disconnect.
    const out = new PassThrough();
    let buffer = "";
    out.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.length > 0) onLine(line);
    });
    out.on("end", onEnd);
    out.on("error", onEnd);

    const logger = new k8s.Log(kc);
    const abort = await logger.log(namespace, podName, "", out, {
      follow: true,
      tailLines: 200,
    });

    return () => {
      abort.abort();
      out.destroy();
    };
  },

  logSources(_rec, _ctx): LogSource[] {
    // Pod stdout carries everything (game + container); there are no separate files.
    return [{ id: "agent" as const, label: "Pod 日誌", available: true }];
  },
};

// ── container file operations via Exec API ──────────────────────────────
// These helpers drive files inside the game-server Pod over `kubectl exec`-
// equivalent WebSocket calls. The game-server image mounts its data at
// /palworld/, so relPath arguments are interpreted relative to that root.
// They are NOT part of the ServerDriver interface — saves.ts / engine-ini.ts
// import them directly to stay backend-aware without leaking exec concerns
// into the driver abstraction.

/** Resolve the backing Pod for an instance, or throw when none is running. */
async function podOf(rec: InstanceRecord): Promise<{ kc: k8s.KubeConfig; namespace: string; podName: string; containerName: string }> {
  const kc = loadKubeConfig();
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  const namespace = rec.k8sNamespace!;
  const stsName = rec.k8sStatefulSet!;
  const podName = await findPodName(coreApi, namespace, stsName);
  if (!podName) throw new Error("找不到運行中的 game-server Pod");
  // 取得容器名（StatefulSet 的第一個容器）
  const sts = await kc.makeApiClient(k8s.AppsV1Api).readNamespacedStatefulSet({
    name: stsName, namespace,
  });
  const containerName = sts.spec?.template?.spec?.containers?.[0]?.name ?? "";
  return { kc, namespace, podName, containerName };
}

/** Run a command inside the game-server Pod; resolve to collected stdout. */
export async function execInPod(rec: InstanceRecord, command: string[]): Promise<string> {
  const { kc, namespace, podName, containerName } = await podOf(rec);
  const exec = new k8s.Exec(kc);
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let output = "";
  let errOutput = "";
  stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  stderr.on("data", (chunk) => {
    errOutput += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    exec
      .exec(
        namespace,
        podName,
        containerName,
        command,
        stdout,
        stderr,
        null,
        false,
        (status) => {
          if (status.status === "Failure" || errOutput) {
            reject(new Error(errOutput || "exec failed"));
          } else {
            resolve();
          }
        },
      )
      .catch(reject);
  });
  return output;
}

/** Read a file under /palworld/ in the Pod as text. */
export async function readFileInPod(rec: InstanceRecord, relPath: string): Promise<string> {
  return execInPod(rec, ["cat", `/palworld/${relPath}`]);
}

/**
 * Write text to a file under /palworld/ in the Pod. Uses a quoted heredoc so
 * the content is passed verbatim (single-quoted PALSERVER_EOF disables shell
 * expansion in the delimiter line), avoiding quoting pitfalls in the body.
 */
export async function writeFileInPod(rec: InstanceRecord, relPath: string, content: string): Promise<void> {
  const fullPath = `/palworld/${relPath}`;
  await execInPod(rec, [
    "sh",
    "-c",
    `cat > '${fullPath}' <<'PALSERVER_EOF'\n${content}\nPALSERVER_EOF`,
  ]);
}

/** List a directory under /palworld/ one entry per line. */
export async function listDirInPod(rec: InstanceRecord, relPath: string): Promise<string> {
  return execInPod(rec, ["ls", "-1", `/palworld/${relPath}`]);
}

/** Pack a directory under /palworld/ into a tar.gz and return the bytes. */
export async function tarDirInPod(rec: InstanceRecord, relPath: string): Promise<Buffer> {
  const { kc, namespace, podName, containerName } = await podOf(rec);
  const exec = new k8s.Exec(kc);
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const chunks: Buffer[] = [];
  stdout.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
  });
  let errOutput = "";
  stderr.on("data", (chunk) => {
    errOutput += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    exec
      .exec(
        namespace,
        podName,
        containerName,
        ["tar", "czf", "-", "-C", `/palworld/${relPath}`, "."],
        stdout,
        stderr,
        null,
        false,
        (status) => {
          if (status.status === "Failure" || errOutput) {
            reject(new Error(errOutput || "tar failed"));
          } else {
            resolve();
          }
        },
      )
      .catch(reject);
  });
  return Buffer.concat(chunks);
}

/** Pipe a tar.gz byte stream into a directory under /palworld/ in the Pod. */
export async function untarIntoPod(rec: InstanceRecord, relPath: string, archive: Buffer): Promise<void> {
  const { kc, namespace, podName, containerName } = await podOf(rec);
  const exec = new k8s.Exec(kc);
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let errOutput = "";
  stderr.on("data", (chunk) => {
    errOutput += chunk.toString();
  });

  // Ensure target exists, then stream the archive into tar's stdin.
  await execInPod(rec, ["mkdir", "-p", `/palworld/${relPath}`]);

  const done = new Promise<void>((resolve, reject) => {
    exec
      .exec(
        namespace,
        podName,
        containerName,
        ["tar", "xzf", "-", "-C", `/palworld/${relPath}`],
        stdout,
        stderr,
        stdin,
        false,
        (status) => {
          if (status.status === "Failure" || errOutput) {
            reject(new Error(errOutput || "untar failed"));
          } else {
            resolve();
          }
        },
      )
      .catch(reject);
  });
  stdin.end(archive);
  await done;
}
