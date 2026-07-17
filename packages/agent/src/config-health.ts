import fs from "node:fs";
import path from "node:path";
import type { ConfigHealth, FileHealth } from "@palserver/shared";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverRoot } from "./native.js";
import { configPlatformDir } from "./platform.js";
import { renderPalWorldSettingsIni } from "./settings-ini.js";
import { makeDirInPod, readFileInPod, writeFileInPod } from "./k8s-files.js";

/** Configuration health for host-native files and the k8s Pod config files. */

const nativeConfigRel = (rec: InstanceRecord) => `Pal/Saved/Config/${configPlatformDir(rec)}`;
const k8sConfigRel = (rec: InstanceRecord) => `Pal/Saved/Config/${configPlatformDir(rec)}`;

const configDir = (root: string, rec: InstanceRecord) => path.join(root, ...nativeConfigRel(rec).split("/"));
const worldIni = (root: string, rec: InstanceRecord) => path.join(configDir(root, rec), "PalWorldSettings.ini");
const engineIni = (root: string, rec: InstanceRecord) => path.join(configDir(root, rec), "Engine.ini");
const nativeRel = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");

function fail(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/** A line the ini parser should recognise: blank, comment, section, key=value. */
const INI_LINE = /^\s*($|;|#|\[.+\]\s*$|[^=\s][^=]*=)/;

export function checkStructure(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let sawSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (/^\[.+\]$/.test(line)) {
      sawSection = true;
      continue;
    }
    if (/^\[/.test(line) && !/\]$/.test(line)) return "區段標頭未正確關閉";
    if (!INI_LINE.test(raw)) return `無法解析的內容:「${line.slice(0, 40)}」`;
  }
  if (!sawSection) return "找不到任何區段標頭";
  return null;
}

function worldHealthText(text: string, displayPath: string): FileHealth {
  const structural = checkStructure(text);
  if (structural) return { exists: true, corrupted: true, reason: structural, path: displayPath };
  if (!/\[\/Script\/Pal\.PalGameWorldSettings\]/.test(text)) {
    return { exists: true, corrupted: true, reason: "缺少 PalGameWorldSettings 區段", path: displayPath };
  }
  const opt = /OptionSettings\s*=\s*\((.*)\)\s*$/m.exec(text);
  if (!opt) {
    return { exists: true, corrupted: true, reason: "OptionSettings 缺失或括號不完整", path: displayPath };
  }
  return { exists: true, corrupted: false, path: displayPath };
}

function engineHealthText(text: string, displayPath: string): FileHealth {
  const structural = checkStructure(text);
  return { exists: true, corrupted: structural !== null, reason: structural ?? undefined, path: displayPath };
}

function missing(displayPath: string): FileHealth {
  return { exists: false, corrupted: false, path: displayPath };
}

function nativeHealth(rec: InstanceRecord, ctx: DriverContext): ConfigHealth {
  const pdir = configPlatformDir(rec);
  // docker: bind-mount saved = Pal/Saved, config under saved/Config/...
  if (rec.backend === "docker") {
    const savedDir = path.join(ctx.instanceDir, "saved");
    const cfgDir = path.join(savedDir, "Config", pdir);
    const world = path.join(cfgDir, "PalWorldSettings.ini");
    const engine = path.join(cfgDir, "Engine.ini");
    const rel = (f: string) => `Saved/Config/${pdir}/${path.basename(f)}`;
    return {
      supported: true,
      world: fs.existsSync(world) ? worldHealthText(fs.readFileSync(world, "utf8"), rel(world)) : missing(rel(world)),
      engine: fs.existsSync(engine) ? engineHealthText(fs.readFileSync(engine, "utf8"), rel(engine)) : missing(rel(engine)),
    };
  }
  const root = serverRoot(rec, ctx);
  const world = worldIni(root, rec);
  const engine = engineIni(root, rec);
  return {
    supported: true,
    world: fs.existsSync(world) ? worldHealthText(fs.readFileSync(world, "utf8"), nativeRel(root, world)) : missing(nativeRel(root, world)),
    engine: fs.existsSync(engine) ? engineHealthText(fs.readFileSync(engine, "utf8"), nativeRel(root, engine)) : missing(nativeRel(root, engine)),
  };
}

/** Read k8s files independently so a first boot can report both as missing. */
async function k8sHealth(rec: InstanceRecord): Promise<ConfigHealth> {
  const worldPath = `${k8sConfigRel(rec)}/PalWorldSettings.ini`;
  const enginePath = `${k8sConfigRel(rec)}/Engine.ini`;
  let world: FileHealth;
  let engine: FileHealth;
  try {
    world = worldHealthText(await readFileInPod(rec, worldPath), worldPath);
  } catch (error) {
    if (error instanceof Error && /找不到運行中的 game-server Pod/.test(error.message)) {
      return { supported: true, world: missing(worldPath), engine: missing(enginePath) };
    }
    world = missing(worldPath);
  }
  try {
    engine = engineHealthText(await readFileInPod(rec, enginePath), enginePath);
  } catch {
    engine = missing(enginePath);
  }
  return { supported: true, world, engine };
}

export async function getConfigHealth(rec: InstanceRecord, ctx: DriverContext): Promise<ConfigHealth> {
  return rec.backend === "k8s" ? k8sHealth(rec) : nativeHealth(rec, ctx);
}

function backupCorrupt(file: string): void {
  if (!fs.existsSync(file)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(file, `${file}.corrupt-${stamp}.bak`);
}

export async function regenerateConfig(
  rec: InstanceRecord,
  ctx: DriverContext,
  which: "world" | "engine",
): Promise<{ path: string; backedUp: boolean }> {
  if (rec.backend === "k8s") {
    const rel = `${k8sConfigRel(rec)}/${which === "world" ? "PalWorldSettings.ini" : "Engine.ini"}`;
    const health = await getConfigHealth(rec, ctx);
    const existed = which === "world" ? health.world.exists : health.engine.exists;
    const content = which === "world" ? renderPalWorldSettingsIni(rec.settings) : "; regenerated by palserver GUI\n";
    try {
      await makeDirInPod(rec, k8sConfigRel(rec));
      await writeFileInPod(rec, rel, content);
    } catch (error) {
      if (error instanceof Error && /找不到運行中的 game-server Pod/.test(error.message)) {
        throw fail("k8s 沒有運行中的 Pod，無法重建設定檔", 409);
      }
      throw error;
    }
    return { path: rel, backedUp: existed };
  }

  const root = serverRoot(rec, ctx);
  fs.mkdirSync(configDir(root, rec), { recursive: true });
  const file = which === "world" ? worldIni(root, rec) : engineIni(root, rec);
  const existed = fs.existsSync(file);
  backupCorrupt(file);
  if (which === "world") fs.writeFileSync(file, renderPalWorldSettingsIni(rec.settings));
  else fs.writeFileSync(file, "; regenerated by palserver GUI\n");
  return { path: nativeRel(root, file), backedUp: existed };
}
