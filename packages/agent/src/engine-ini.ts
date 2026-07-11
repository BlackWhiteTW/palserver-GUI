import fs from "node:fs";
import path from "node:path";
import {
  ENGINE_OPTIONS,
  type EngineOptionKey,
  type EngineSettings,
  type EngineSettingsStatus,
} from "@palserver/shared";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverRoot } from "./native.js";
import { readFileInPod, writeFileInPod } from "./k8s.js";

/**
 * Read/write the managed subset of Engine.ini.
 *
 * Engine.ini belongs to the user: it may hold sections and keys we know
 * nothing about (mods, hand-tuned cvars). Writes therefore merge in place —
 * we rewrite only the keys we manage, keep every other line byte-for-byte,
 * and append sections only when they're missing.
 *
 * On k8s the file lives in the game-server Pod under /palworld/, reached via
 * `kubectl exec`; the Pod filesystem is always Linux, so its path uses
 * LinuxServer regardless of the agent host's platform.
 */

const CONFIG_PLATFORM_DIR = process.platform === "win32" ? "WindowsServer" : "LinuxServer";
const REL_PATH = `Pal/Saved/Config/${CONFIG_PLATFORM_DIR}/Engine.ini`;
const K8S_REL_PATH = "Pal/Saved/Config/LinuxServer/Engine.ini";

const enginePath = (root: string) => path.join(root, ...REL_PATH.split("/"));

/** Backend-aware Engine.ini read: native hits the host FS, k8s reaches the
 * Pod over exec. Returns null when the file does not exist. */
async function readEngineIni(rec: InstanceRecord, ctx: DriverContext): Promise<string | null> {
  if (rec.backend === "k8s") {
    return readFileInPod(rec, K8S_REL_PATH).catch(() => null);
  }
  const file = enginePath(serverRoot(rec, ctx));
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** Backend-aware Engine.ini write. native ensures the config dir exists;
 * k8s writes into the running Pod (the dir already exists once the server
 * has booted at least once). */
async function writeEngineIni(rec: InstanceRecord, ctx: DriverContext, content: string): Promise<void> {
  if (rec.backend === "k8s") {
    await writeFileInPod(rec, K8S_REL_PATH, content);
    return;
  }
  const file = enginePath(serverRoot(rec, ctx));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Parse managed keys out of raw Engine.ini text. Backend-agnostic. */
function parseEngineValues(raw: string): EngineSettings {
  const values: EngineSettings = {};
  let section = "";
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header) {
      section = header[1];
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0 || trimmed.startsWith(";")) continue;
    const key = trimmed.slice(0, eq).trim() as EngineOptionKey;
    if (!(key in ENGINE_OPTIONS) || sectionOf(key) !== section) continue;
    const parsed = parseValue(key, trimmed.slice(eq + 1));
    if (parsed !== null) values[key] = parsed;
  }
  return values;
}

/** Merge `patch` into raw Engine.ini text, preserving unmanaged content.
 * Backend-agnostic. Returns the merged text. */
function mergeEnginePatch(raw: string, patch: EngineSettings): string {
  const lines = raw.split(/\r?\n/);
  const pending = new Map<EngineOptionKey, number | boolean>(
    Object.entries(patch) as [EngineOptionKey, number | boolean][],
  );

  // Pass 1: rewrite keys where they already live.
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header) {
      section = header[1];
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0 || trimmed.startsWith(";")) continue;
    const key = trimmed.slice(0, eq).trim() as EngineOptionKey;
    if (!pending.has(key) || sectionOf(key) !== section) continue;
    lines[i] = `${key}=${formatValue(key, pending.get(key)!)}`;
    pending.delete(key);
  }

  // Pass 2: append the rest under their sections, creating sections as needed.
  for (const [key, value] of pending) {
    const target = sectionOf(key);
    const headerIndex = lines.findIndex((l) => l.trim() === `[${target}]`);
    const entry = `${key}=${formatValue(key, value)}`;
    if (headerIndex === -1) {
      if (lines.length > 0 && lines[lines.length - 1].trim() !== "") lines.push("");
      lines.push(`[${target}]`, entry);
      continue;
    }
    let end = headerIndex + 1;
    let lastContent = headerIndex;
    while (end < lines.length && !/^\[.+\]$/.test(lines[end].trim())) {
      if (lines[end].trim() !== "") lastContent = end;
      end++;
    }
    lines.splice(lastContent + 1, 0, entry);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Which section each managed key belongs to. */
const sectionOf = (key: EngineOptionKey) => ENGINE_OPTIONS[key].section;

function parseValue(key: EngineOptionKey, raw: string): number | boolean | null {
  const meta = ENGINE_OPTIONS[key];
  const value = raw.trim();
  if (meta.type === "bool") {
    if (/^true$/i.test(value)) return true;
    if (/^false$/i.test(value)) return false;
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return meta.type === "int" ? Math.trunc(num) : num;
}

function formatValue(key: EngineOptionKey, value: number | boolean): string {
  const meta = ENGINE_OPTIONS[key];
  if (meta.type === "bool") return value ? "True" : "False";
  if (meta.type === "int") return String(Math.trunc(Number(value)));
  return Number(value).toFixed(6);
}

export async function getEngineSettings(
  rec: InstanceRecord,
  ctx: DriverContext,
): Promise<EngineSettingsStatus> {
  if (rec.backend === "docker") {
    return {
      supported: false,
      reason: "效能設定目前不支援 Docker 模式的實例",
      exists: false,
      path: null,
      values: {},
    };
  }
  const displayPath = rec.backend === "k8s" ? K8S_REL_PATH : REL_PATH;
  const raw = await readEngineIni(rec, ctx);
  if (raw === null) {
    return {
      supported: true,
      reason: "Engine.ini 尚未產生 — 先啟動一次伺服器,或直接儲存以建立檔案",
      exists: false,
      path: displayPath,
      values: {},
    };
  }
  return { supported: true, exists: true, path: displayPath, values: parseEngineValues(raw) };
}

/**
 * Merge `patch` into Engine.ini, preserving unmanaged content. Keys already
 * present are rewritten in place; new keys are appended to their section;
 * missing sections are appended at the end.
 */
export async function writeEngineSettings(
  rec: InstanceRecord,
  ctx: DriverContext,
  patch: EngineSettings,
): Promise<EngineSettingsStatus> {
  if (rec.backend === "docker") {
    throw Object.assign(new Error("效能設定目前不支援 Docker 模式的實例"), { statusCode: 409 });
  }
  const existing = (await readEngineIni(rec, ctx)) ?? "";
  const merged = mergeEnginePatch(existing, patch);
  await writeEngineIni(rec, ctx, merged);
  return getEngineSettings(rec, ctx);
}
