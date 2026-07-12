import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import extractZip from "extract-zip";
import {
  PAL_STATS_TABLE,
  PAL_STAT_KEYS,
  PAL_STAT_OPTIONS,
  type PalSchemaStatus,
  type PalStatKey,
  type PalStatValues,
  type PalStatsRow,
  type PalStatsStatus,
} from "@palserver/shared";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverRoot } from "./native.js";
import { activeWorldGuid, createBackup } from "./saves.js";

/**
 * PalSchema 整合(贊助者先行版 pal-stats):
 *  - 一鍵安裝 PalSchema 及其相依的 UE4SS(Okaetsu 的 experimental-palworld 版,
 *    PalSchema 強制此版,標準 UE4SS 會崩潰),並設定 UE4SS-settings.ini / mods.txt。
 *  - 讀/寫我們自管的 PalSchema 子 mod,以 raw DataTable patch 改 DT_PalMonsterParameter
 *    的物種基礎數值(HP / 攻防 / 捕獲率…),首領版(Boss_)是獨立 row 可單獨調。
 *
 * 只有我們這個子 mod 的 raw/pal-stats.json 由 GUI 管理;寫入採「只覆寫受管欄位、
 * 保留其餘 row/欄位」策略,使用者手動加的內容不會被吃掉。改動在伺服器重啟後生效。
 * Docs / 欄位證據:.claude/notes/palschema-reference.md、palschema-datatable-fields.md
 */

const OUR_MOD_NAME = "PalServerGUI";
/** PalSchema 需要在 UE4SS mods.txt/json 啟用的內建 mod。 */
const REQUIRED_UE4SS_MODS = [
  "CheatManagerEnablerMod",
  "ConsoleCommandsMod",
  "ConsoleEnablerMod",
  "BPModLoaderMod",
  "BPML_GenericFunctions",
];

const win64Dir = (root: string) => path.join(root, "Pal", "Binaries", "Win64");
/** UE4SS 目錄:fork 用大寫 UE4SS/,舊/標準安裝可能是小寫 ue4ss/。 */
const ue4ssDir = (root: string) => {
  const upper = path.join(win64Dir(root), "UE4SS");
  const lower = path.join(win64Dir(root), "ue4ss");
  if (fs.existsSync(upper)) return upper;
  if (fs.existsSync(lower)) return lower;
  return upper; // 安裝 fork 後會是大寫
};
const ue4ssModsDir = (root: string) => path.join(ue4ssDir(root), "Mods");
const palSchemaDir = (root: string) => path.join(ue4ssModsDir(root), "PalSchema");
const ourModDir = (root: string) => path.join(palSchemaDir(root), "mods", OUR_MOD_NAME);
const rawDir = (root: string) => path.join(ourModDir(root), "raw");
const statsFile = (root: string) => path.join(rawDir(root), "pal-stats.json");
const ue4ssSettingsFile = (root: string) => path.join(ue4ssDir(root), "UE4SS-settings.ini");
const modsTxtFile = (root: string) => path.join(ue4ssModsDir(root), "mods.txt");
const markerFile = (root: string) => path.join(win64Dir(root), ".palserver-palschema.json");

/** UE4SS 是否已安裝(不區分 fork/標準;安裝流程會補上 fork)。 */
function ue4ssInstalled(root: string): boolean {
  return (
    fs.existsSync(path.join(ue4ssDir(root), "UE4SS.dll")) ||
    fs.existsSync(path.join(win64Dir(root), "UE4SS.dll")) ||
    fs.existsSync(path.join(win64Dir(root), "ue4ss", "UE4SS.dll"))
  );
}

interface PalSchemaMarker {
  ue4ss?: string;
  palschema?: string;
}
function readMarker(root: string): PalSchemaMarker {
  try {
    return JSON.parse(fs.readFileSync(markerFile(root), "utf8")) as PalSchemaMarker;
  } catch {
    return {};
  }
}
function writeMarker(root: string, patch: PalSchemaMarker): void {
  fs.writeFileSync(markerFile(root), JSON.stringify({ ...readMarker(root), ...patch }, null, 2));
}

export function getPalSchemaStatus(rec: InstanceRecord, ctx: DriverContext): PalSchemaStatus {
  if (rec.backend !== "native") {
    return { supported: false, reason: "PalSchema 僅支援原生模式的實例", ue4ss: false, installed: false, version: null };
  }
  const root = serverRoot(rec, ctx);
  if (!fs.existsSync(win64Dir(root))) {
    return { supported: false, reason: "伺服器尚未安裝完成 — 先啟動一次讓 agent 下載伺服器", ue4ss: false, installed: false, version: null };
  }
  const marker = readMarker(root);
  return {
    supported: true,
    ue4ss: ue4ssInstalled(root),
    installed: fs.existsSync(palSchemaDir(root)),
    version: marker.palschema ?? null,
  };
}

/* ── 純函式(單元測試用),不碰 fs ── */

/** 設定 UE4SS-settings.ini 的鍵:存在則就地覆寫、不存在則附加。保留其餘內容。 */
export function patchIniKeys(text: string, kv: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(kv)) {
    const re = new RegExp(`^([ \\t]*)${key}[ \\t]*=.*$`, "m");
    if (re.test(out)) out = out.replace(re, `$1${key} = ${value}`);
    else out = `${out.replace(/\s*$/, "")}\n${key} = ${value}\n`;
  }
  return out;
}

/** 把指定 mod 在 mods.txt 設為啟用(`Name : 1`);已存在就改值,否則附加。 */
export function enableModsTxt(text: string, names: string[]): string {
  const lines = text.length ? text.split("\n") : [];
  for (const name of names) {
    const idx = lines.findIndex((l) => l.trim().match(new RegExp(`^${name}\\s*:`)));
    const flag = `${name} : 1`;
    if (idx >= 0) lines[idx] = flag;
    else lines.push(flag);
  }
  return lines.join("\n");
}

/** 把一列數值合併進既有 raw 結構:只覆寫白名單內的欄位,保留其他 table/row/欄位。 */
export function mergeStatsPatch(
  existing: Record<string, unknown>,
  table: string,
  row: string,
  patch: PalStatValues,
): Record<string, unknown> {
  const next = structuredClone(existing);
  const tbl = (next[table] && typeof next[table] === "object" ? next[table] : {}) as Record<string, unknown>;
  const rowObj = (tbl[row] && typeof tbl[row] === "object" ? tbl[row] : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if ((PAL_STAT_OPTIONS as Record<string, unknown>)[k] && typeof v === "number") {
      const meta = PAL_STAT_OPTIONS[k as PalStatKey];
      rowObj[meta.key] = meta.type === "int" ? Math.trunc(v) : v;
    }
  }
  tbl[row] = rowObj;
  next[table] = tbl;
  return next;
}

const ROW_RE = /^[A-Za-z0-9_]{1,80}$/;

/* ── 安裝 ── */

interface GitRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

async function resolveRelease(
  repo: string,
  tag: string | "latest",
  pick: (name: string) => boolean,
  envUrl: string,
): Promise<{ version: string; url: string }> {
  const override = process.env[envUrl];
  if (override) return { version: "custom", url: override };
  const endpoint =
    tag === "latest"
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
  const res = await fetch(endpoint, {
    headers: { "user-agent": "palserver-gui", accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub release 查詢失敗 ${repo}@${tag}: HTTP ${res.status}`);
  const release = (await res.json()) as GitRelease;
  const asset = release.assets.find((a) => pick(a.name));
  if (!asset) {
    throw new Error(`在 ${repo}@${release.tag_name} 找不到對應下載檔;可設 ${envUrl} 指定網址`);
  }
  return { version: release.tag_name, url: asset.browser_download_url };
}

async function downloadZip(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`下載失敗: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * 安裝 PalSchema + 其相依 UE4SS(experimental-palworld fork)並完成設定。
 * 呼叫端需確保伺服器已停止(DLL 執行中會被鎖)。
 */
export async function installPalSchema(rec: InstanceRecord, ctx: DriverContext): Promise<{ version: string }> {
  const status = getPalSchemaStatus(rec, ctx);
  if (!status.supported) throw Object.assign(new Error(status.reason ?? "unsupported"), { statusCode: 409 });
  const root = serverRoot(rec, ctx);

  // 風險轉變時點:best-effort 先備份當前世界(伺服器已停也能 tar;失敗不阻擋)。
  const guid = activeWorldGuid(root);
  if (guid) await createBackup(rec, ctx, guid).catch(() => {});

  fs.mkdirSync(ctx.instanceDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "palschema-"));
  try {
    // 1) UE4SS fork(experimental-palworld;非 zDev 開發版)。內容相對 Win64 佈局。
    const ue4ss = await resolveRelease(
      "Okaetsu/RE-UE4SS",
      "experimental-palworld",
      (n) => /^UE4SS-Palworld\.zip$/i.test(n),
      "PALSERVER_UE4SS_PALWORLD_URL",
    );
    const ue4ssZip = path.join(tmp, "ue4ss.zip");
    await downloadZip(ue4ss.url, ue4ssZip);
    await extractZip(ue4ssZip, { dir: win64Dir(root) });
    if (!fs.existsSync(ue4ssDir(root))) {
      throw new Error("UE4SS 解壓後找不到 UE4SS 目錄,佈局可能有變;可設 PALSERVER_UE4SS_PALWORLD_URL");
    }

    // 2) UE4SS 設定:PalSchema 要求 dx11 + 關閉 UObjectArray 快取。
    const settings = ue4ssSettingsFile(root);
    if (fs.existsSync(settings)) {
      fs.writeFileSync(
        settings,
        patchIniKeys(fs.readFileSync(settings, "utf8"), {
          GraphicsAPI: "dx11",
          bUseUObjectArrayCache: "false",
        }),
      );
    }
    // 3) 啟用必要的內建 mod。
    fs.mkdirSync(ue4ssModsDir(root), { recursive: true });
    const modsTxt = modsTxtFile(root);
    const modsTxtText = fs.existsSync(modsTxt) ? fs.readFileSync(modsTxt, "utf8") : "";
    fs.writeFileSync(modsTxt, enableModsTxt(modsTxtText, REQUIRED_UE4SS_MODS));

    // 4) PalSchema 本體:zip 頂層即 PalSchema/,解壓進 Mods/。
    const ps = await resolveRelease(
      "Okaetsu/PalSchema",
      "latest",
      (n) => /\.zip$/i.test(n) && !/source/i.test(n),
      "PALSERVER_PALSCHEMA_URL",
    );
    const psZip = path.join(tmp, "palschema.zip");
    await downloadZip(ps.url, psZip);
    await extractZip(psZip, { dir: ue4ssModsDir(root) });
    if (!fs.existsSync(palSchemaDir(root))) {
      throw new Error("PalSchema 解壓後找不到 PalSchema 目錄,佈局可能有變;可設 PALSERVER_PALSCHEMA_URL");
    }

    // 5) 建立我們自管的子 mod(metadata.json + raw/)。
    scaffoldOurMod(root);

    writeMarker(root, { ue4ss: ue4ss.version, palschema: ps.version });
    return { version: ps.version };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function scaffoldOurMod(root: string): void {
  fs.mkdirSync(rawDir(root), { recursive: true });
  const meta = path.join(ourModDir(root), "metadata.json");
  if (!fs.existsSync(meta)) {
    fs.writeFileSync(
      meta,
      JSON.stringify(
        { name: OUR_MOD_NAME, authors: ["palserver-gui"], description: "GUI 管理的物種數值調整", version: "1.0.0" },
        null,
        2,
      ),
    );
  }
}

/** 移除 PalSchema 本體與我們的子 mod;保留 UE4SS(其他 mod 可能還要用)。 */
export function removePalSchema(rec: InstanceRecord, ctx: DriverContext): void {
  const root = serverRoot(rec, ctx);
  fs.rmSync(palSchemaDir(root), { recursive: true, force: true });
  const marker = readMarker(root);
  delete marker.palschema;
  fs.writeFileSync(markerFile(root), JSON.stringify(marker, null, 2));
}

/* ── 數值讀寫 ── */

function readStatsRaw(root: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(statsFile(root), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 把 raw 結構裡的一 table 轉成 {row, values(白名單且為數字)} 列表。 */
function rowsFromRaw(raw: Record<string, unknown>): PalStatsRow[] {
  const tbl = raw[PAL_STATS_TABLE];
  if (!tbl || typeof tbl !== "object") return [];
  const out: PalStatsRow[] = [];
  for (const [row, obj] of Object.entries(tbl as Record<string, unknown>)) {
    if (!obj || typeof obj !== "object") continue;
    const values: PalStatValues = {};
    for (const k of PAL_STAT_KEYS) {
      const raw2 = (obj as Record<string, unknown>)[PAL_STAT_OPTIONS[k].key];
      if (typeof raw2 === "number") values[k] = raw2;
    }
    if (Object.keys(values).length) out.push({ row, values });
  }
  return out;
}

export function getPalStats(rec: InstanceRecord, ctx: DriverContext): PalStatsStatus {
  const schema = getPalSchemaStatus(rec, ctx);
  if (!schema.supported) return { supported: false, reason: schema.reason, schema, rows: [] };
  if (!schema.installed) {
    return { supported: false, reason: "尚未安裝 PalSchema", schema, rows: [] };
  }
  const root = serverRoot(rec, ctx);
  return { supported: true, schema, rows: rowsFromRaw(readStatsRaw(root)) };
}

/** 寫入(合併)一列物種數值。row 必須是 DataTable 的 RowName(如 Anubis / Boss_Anubis)。 */
export function writePalStats(
  rec: InstanceRecord,
  ctx: DriverContext,
  row: string,
  patch: PalStatValues,
): PalStatsStatus {
  const schema = getPalSchemaStatus(rec, ctx);
  if (!schema.supported) throw Object.assign(new Error(schema.reason ?? "unsupported"), { statusCode: 409 });
  if (!schema.installed) throw Object.assign(new Error("尚未安裝 PalSchema"), { statusCode: 409 });
  if (!ROW_RE.test(row)) throw Object.assign(new Error("無效的帕魯 row 名"), { statusCode: 400 });

  const root = serverRoot(rec, ctx);
  scaffoldOurMod(root); // 確保 raw/ 目錄存在(安裝後理應已在)
  const merged = mergeStatsPatch(readStatsRaw(root), PAL_STATS_TABLE, row, patch);
  fs.writeFileSync(statsFile(root), JSON.stringify(merged, null, 4));
  return { supported: true, schema, rows: rowsFromRaw(merged) };
}

/** 清空所有已寫入的物種數值調整(移除受管 table),PalSchema 本體保留。
 *  刻意不做贊助者 gate:讓「贊助→取消贊助」的使用者也能把數值改回原本設定。 */
export function clearPalStats(rec: InstanceRecord, ctx: DriverContext): PalStatsStatus {
  const schema = getPalSchemaStatus(rec, ctx);
  if (!schema.supported) throw Object.assign(new Error(schema.reason ?? "unsupported"), { statusCode: 409 });
  if (!schema.installed) throw Object.assign(new Error("尚未安裝 PalSchema"), { statusCode: 409 });
  const root = serverRoot(rec, ctx);
  scaffoldOurMod(root);
  const raw = readStatsRaw(root);
  delete raw[PAL_STATS_TABLE];
  fs.writeFileSync(statsFile(root), JSON.stringify(raw, null, 4));
  return { supported: true, schema, rows: rowsFromRaw(raw) };
}
