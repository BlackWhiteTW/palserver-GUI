/**
 * 從 paldb.cc 抓「帕魯物種原版數值」(DT_PalMonsterParameter 現行值),生成
 * packages/web/public/game-data/pal-stats-defaults.json —— 帕魯數值編輯器的
 * placeholder / row 名大小寫校正 / 變體存在性判斷都吃這份。
 *
 * 抓法(2026-07-17 驗證,見 .claude/notes/palstats-roadmap.md):
 *  1. 從 https://paldb.cc/en/Pals 索引頁枚舉全部一般種頁 slug(顯示名,
 *     與內部 id 不同:FlameBuffalo 的頁面是 Arsox)。
 *  2. 每頁「Tribes」卡列出該 tribe 全部變體(Boss_/GYM_ …)的頁面連結,跟進去抓。
 *  3. 頁內 Stats/Movement 卡是 label→value 列;「Code」欄位 = 權威 RowName
 *     (大小寫以此為準:Boss_Anubis vs BOSS_BlackGriffon 不一致)。
 *  4. 欄位顯示標籤 ≠ uasset 鍵名的三個:Health→Hp、Attack→ShotAttack、
 *     Work Speed→CraftSpeed;其餘標籤即鍵名。同名標籤取「第一次出現」
 *     (第二次是等級縮放後的範圍值,如 "5700 – 7140")。
 *
 * 用法:node scripts/fetch-pal-stats-defaults.mjs
 * 遊戲改版後隨 game-data 維護流程重跑(docs/game-data-maintenance.md)。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "packages/web/public/game-data/pal-stats-defaults.json");

const UA = "palserver-gui data fetcher (github.com/io-software-ai/palserver-gui)";
const CONCURRENCY = 6;

/** 顯示標籤 → 我們的欄位鍵(= uasset 鍵名)。 */
const LABEL_MAP = {
  Health: "Hp",
  MeleeAttack: "MeleeAttack",
  Attack: "ShotAttack",
  Defense: "Defense",
  Support: "Support",
  "Work Speed": "CraftSpeed",
  CaptureRateCorrect: "CaptureRateCorrect",
  WalkSpeed: "WalkSpeed",
  RunSpeed: "RunSpeed",
  RideSprintSpeed: "RideSprintSpeed",
};

/** 工作頁 href → uasset 鍵(paldb 未顯示 OilExtraction,該鍵無 placeholder)。 */
const WORK_MAP = {
  Kindling: "WorkSuitability_EmitFlame",
  Watering: "WorkSuitability_Watering",
  Planting: "WorkSuitability_Seeding",
  Generating_Electricity: "WorkSuitability_GenerateElectricity",
  Handiwork: "WorkSuitability_Handcraft",
  Gathering: "WorkSuitability_Collection",
  Lumbering: "WorkSuitability_Deforest",
  Mining: "WorkSuitability_Mining",
  Medicine_Production: "WorkSuitability_ProduceMedicine",
  Cooling: "WorkSuitability_Cool",
  Transporting: "WorkSuitability_Transport",
  Farming: "WorkSuitability_MonsterFarm",
};

async function fetchPage(slug) {
  const res = await fetch(`https://paldb.cc/en/${slug}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** 解析 label→value 列(取每個 label 第一次出現);回傳 {code, stats}。 */
function parsePage(html) {
  const pat =
    /<div class="d-flex justify-content-between p-2 align-items-center[^"]*">\s*<div>(?:<img[^>]*\/?>)?([^<]+)<\/div>([\s\S]*?)\n {12}<\/div>/g;
  const seen = new Set();
  const stats = {};
  let code = null;
  for (const m of html.matchAll(pat)) {
    const label = m[1].trim();
    if (seen.has(label)) continue;
    seen.add(label);
    const vals = [...m[2].matchAll(/<div>([^<]*)<\/div>/g)].map((x) => x[1].trim());
    const value = vals.length ? vals[vals.length - 1] : "";
    if (label === "Code") code = value;
    const key = LABEL_MAP[label];
    if (key && /^-?\d+(\.\d+)?$/.test(value)) stats[key] = Number(value);
  }
  // 工作適性卡:列格式 <a href="Mining">…</a> + Lv</span>(<span …>)?N
  for (const m of html.matchAll(
    /<a href="([A-Za-z_]+)"><img[^>]*\/>\s*[A-Za-z_ ]+<\/a><\/div><div><span style="font-size:x-small">Lv<\/span>(?:<span[^>]*>)?(\d+)/g,
  )) {
    const key = WORK_MAP[m[1]];
    if (key && stats[key] === undefined) stats[key] = Number(m[2]);
  }
  // 沒列出的工作 = 0(頁面只列 >0 的);有 Code 才代表是帕魯頁
  if (code) for (const key of Object.values(WORK_MAP)) stats[key] ??= 0;
  return { code, stats };
}

/** Tribes 卡片裡的變體頁 slug 清單。 */
function parseTribeLinks(html) {
  const i = html.indexOf(">Tribes</h5>");
  if (i < 0) return [];
  const seg = html.slice(i, html.indexOf("</table>", i));
  return [...seg.matchAll(/href="([^"?#][^"]*)"/g)]
    .map((m) => m[1])
    .filter((s) => !s.includes("/") && !s.includes("?"));
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let idx = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const defaults = {}; // RowName → stats
const fetchedSlugs = new Set();
const failures = [];

async function grab(slug, followTribes) {
  if (fetchedSlugs.has(slug)) return;
  fetchedSlugs.add(slug);
  let html;
  try {
    html = await fetchPage(slug);
  } catch (err) {
    failures.push(`${slug}: ${err.message}`);
    return;
  }
  const { code, stats } = parsePage(html);
  if (code && Object.keys(stats).length) defaults[code] = stats;
  else if (!code) failures.push(`${slug}: 無 Code 欄位`);
  if (followTribes) {
    const links = parseTribeLinks(html).filter((s) => !fetchedSlugs.has(s));
    await mapLimit(links, 2, (s) => grab(s, false));
  }
}

// 索引頁枚舉一般種 slug(顯示名)
const indexHtml = await fetchPage("Pals");
const slugs = [...new Set([...indexHtml.matchAll(/<a[^>]*class="itemname"[^>]*href="([^"?#/]+)"/g)].map((m) => m[1]))];
console.log(`索引頁找到 ${slugs.length} 隻一般種,抓取中(含各自變體頁)…`);
let done = 0;
await mapLimit(slugs, CONCURRENCY, async (slug) => {
  await grab(slug, true);
  if (++done % 40 === 0) console.log(`  ${done}/${slugs.length}`);
});

const sorted = Object.fromEntries(Object.entries(defaults).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
console.log(`寫入 ${OUT}`);
console.log(`row 數:${Object.keys(sorted).length}(頁面 ${fetchedSlugs.size} 個)`);
const prefixes = {};
for (const row of Object.keys(sorted)) {
  const m = row.match(/^([A-Za-z]+_)/);
  const p = m && ["Boss_", "BOSS_", "GYM_", "RAID_", "PREDATOR_", "SUMMON_"].includes(m[1]) ? m[1] : "(normal)";
  prefixes[p] = (prefixes[p] ?? 0) + 1;
}
console.log("前綴分佈:", JSON.stringify(prefixes));
if (failures.length) {
  console.log(`失敗 ${failures.length} 筆:`);
  for (const f of failures.slice(0, 20)) console.log("  -", f);
}
