import fs from "node:fs";
import path from "node:path";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverRoot } from "./native.js";
import {
  deletePathInPod,
  execInPod,
  makeDirInPod,
  readFileInPod,
  writeFileBytesInPod,
} from "./k8s-files.js";

/** Paths passed to this module are relative to the game install root. */
function hostPath(rec: InstanceRecord, ctx: DriverContext, relPath: string): string {
  return path.join(serverRoot(rec, ctx), ...relPath.split("/"));
}

export async function runtimeExists(
  rec: InstanceRecord,
  ctx: DriverContext,
  relPath: string,
  kind: "e" | "d" | "f" = "e",
): Promise<boolean> {
  if (rec.backend === "k8s") {
    try {
      await execInPod(rec, ["test", `-${kind}`, `/palworld/${relPath}`]);
      return true;
    } catch {
      return false;
    }
  }
  const target = hostPath(rec, ctx, relPath);
  try {
    const stat = fs.statSync(target);
    return kind === "d" ? stat.isDirectory() : kind === "f" ? stat.isFile() : true;
  } catch {
    return false;
  }
}

export async function runtimeReadText(
  rec: InstanceRecord,
  ctx: DriverContext,
  relPath: string,
): Promise<string> {
  if (rec.backend === "k8s") return readFileInPod(rec, relPath);
  return fs.readFileSync(hostPath(rec, ctx, relPath), "utf8");
}

export async function runtimeWriteBytes(
  rec: InstanceRecord,
  ctx: DriverContext,
  relPath: string,
  content: Uint8Array,
): Promise<void> {
  if (rec.backend === "k8s") {
    const parent = path.posix.dirname(relPath);
    await makeDirInPod(rec, parent === "." ? "" : parent);
    await writeFileBytesInPod(rec, relPath, content);
    return;
  }
  const target = hostPath(rec, ctx, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

export async function runtimeWriteText(
  rec: InstanceRecord,
  ctx: DriverContext,
  relPath: string,
  content: string,
): Promise<void> {
  await runtimeWriteBytes(rec, ctx, relPath, Buffer.from(content, "utf8"));
}

export async function runtimeMkdir(
  rec: InstanceRecord,
  ctx: DriverContext,
  relPath: string,
): Promise<void> {
  if (rec.backend === "k8s") {
    await makeDirInPod(rec, relPath);
    return;
  }
  fs.mkdirSync(hostPath(rec, ctx, relPath), { recursive: true });
}

export async function runtimeRemove(
  rec: InstanceRecord,
  ctx: DriverContext,
  relPath: string,
): Promise<void> {
  if (rec.backend === "k8s") {
    await deletePathInPod(rec, relPath);
    return;
  }
  fs.rmSync(hostPath(rec, ctx, relPath), { recursive: true, force: true });
}

