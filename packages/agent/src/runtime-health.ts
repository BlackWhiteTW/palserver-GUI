import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { InstanceRecord } from "./store.js";
import * as dockerOps from "./docker.js";
import {
  deleteHealthTempDirInPod,
  execInPod,
  makeHealthTempDirInPod,
  readHealthTempFileInPod,
  writeHealthTempFileInPod,
} from "./k8s-files.js";

const HEALTH_ROOT = "/tmp/palserver-health";
const REMOTE_CONVERT_TIMEOUT_SECONDS = 30 * 60;

export function containerConverterCommand(
  runtime: InstanceRecord["runtime"],
  toolRemote: string,
  inputRemote: string,
  outputRemote: string,
): string[] {
  const args = [
    "--to-json",
    "-o",
    outputRemote,
    "--minify-json",
    "-f",
    inputRemote,
  ];
  const tool = runtime === "wine"
    ? ["wine", toolRemote, ...args]
    : [toolRemote, ...args];
  // palsav 的 CLI 在未固定 hash seed 時會以相同 argv 自我重新啟動。
  // PyInstaller + Wine 會因此多塞一次 exe 路徑,讓真正的 sav 被判成多餘參數。
  return [
    "timeout",
    String(REMOTE_CONVERT_TIMEOUT_SECONDS),
    "env",
    "PYTHONHASHSEED=0",
    ...tool,
  ];
}

function safeName(value: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error("健檢暫存檔名不合法");
  return value;
}

function collectTar(localPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      ["-cf", "-", "-C", path.dirname(localPath), path.basename(localPath)],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(out));
      reject(new Error(`建立容器健檢上傳封包失敗(exit ${code}):${Buffer.concat(err).toString("utf8").trim()}`));
    });
  });
}

function remoteRoot(jobId: string): string {
  return `${HEALTH_ROOT}/${safeName(jobId)}`;
}

function shellRunnerArgs(outputPath: string, errorPath: string, command: string[]): string[] {
  // Keep tool diagnostics out of the Kubernetes exec transport. A successful
  // Wine run may write harmless notices to stderr; only a non-zero tool exit
  // is surfaced, with the captured tail copied to stderr on failure.
  return [
    "sh",
    "-c",
    'out="$1"; err="$2"; shift 2; "$@" > "$out.stdout" 2> "$err"; code=$?; if [ "$code" -eq 124 ]; then echo "存檔轉換超過 30 分鐘,已中止" >&2; elif [ "$code" -ne 0 ]; then tail -c 4000 "$err" >&2; fi; exit "$code"',
    "palserver-health-run",
    outputPath,
    errorPath,
    ...command,
  ];
}

/**
 * Convert save files inside a Docker/Kubernetes game container.
 * The agent only stages inputs and retrieves the resulting JSON for its pure
 * analysis pass; it never spawns the converter for container-backed records.
 */
export class ContainerHealthRunner {
  private readonly root: string;
  private readonly toolRemote: string;
  private prepared = false;

  constructor(
    private readonly rec: InstanceRecord,
    private readonly toolPath: string,
    jobId: string,
  ) {
    this.root = remoteRoot(jobId);
    this.toolRemote = `${this.root}/${safeName(path.basename(toolPath))}`;
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    if (this.rec.backend === "k8s") {
      await makeHealthTempDirInPod(this.rec, path.basename(this.root));
      await writeHealthTempFileInPod(
        this.rec,
        path.basename(this.root),
        path.basename(this.toolRemote),
        await fs.promises.readFile(this.toolPath),
      );
      await execInPod(this.rec, ["chmod", "+x", this.toolRemote]);
    } else {
      await dockerOps.execInContainer(this.rec, ["mkdir", "-p", this.root]);
      await dockerOps.putArchiveToContainer(this.rec, await collectTar(this.toolPath), this.root);
      // Docker putArchive can preserve root ownership, so make Linux assets
      // executable explicitly as root. Wine does not require this bit, but it
      // is harmless for the Windows asset.
      await dockerOps.execInContainerChecked(this.rec, ["chmod", "+x", this.toolRemote], "0");
    }
    this.prepared = true;
  }

  async convert(localInput: string, localOutput: string): Promise<void> {
    await this.prepare();
    const inputName = safeName(path.basename(localInput));
    const outputName = safeName(path.basename(localOutput));
    const inputRemote = `${this.root}/${inputName}`;
    const outputRemote = `${this.root}/${outputName}`;
    const errorRemote = `${this.root}/${outputName}.stderr`;
    const input = await fs.promises.readFile(localInput);

    if (this.rec.backend === "k8s") {
      const dirName = path.basename(this.root);
      await writeHealthTempFileInPod(this.rec, dirName, inputName, input);
      await execInPod(
        this.rec,
        shellRunnerArgs(outputRemote, errorRemote, this.converterCommand(inputRemote, outputRemote)),
      );
      const json = await readHealthTempFileInPod(this.rec, dirName, outputName);
      await fs.promises.writeFile(localOutput, json);
      return;
    }

    await dockerOps.putArchiveToContainer(this.rec, await collectTar(localInput), this.root);
    await dockerOps.execInContainerChecked(
      this.rec,
      shellRunnerArgs(outputRemote, errorRemote, this.converterCommand(inputRemote, outputRemote)),
    );
    const json = await dockerOps.execInContainerChecked(this.rec, ["cat", outputRemote]);
    await fs.promises.writeFile(localOutput, json, "utf8");
  }

  async cleanup(): Promise<void> {
    if (!this.prepared) return;
    if (this.rec.backend === "k8s") {
      await deleteHealthTempDirInPod(this.rec, path.basename(this.root)).catch(() => {});
    } else {
      await dockerOps.execInContainer(this.rec, ["rm", "-rf", this.root]).catch(() => {});
    }
    this.prepared = false;
  }

  private converterCommand(inputRemote: string, outputRemote: string): string[] {
    return containerConverterCommand(this.rec.runtime, this.toolRemote, inputRemote, outputRemote);
  }
}
