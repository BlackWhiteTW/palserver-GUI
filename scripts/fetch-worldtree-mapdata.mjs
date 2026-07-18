#!/usr/bin/env node
/**
 * 抓世界樹地圖的靜態圖層資料(Alpha 頭目/地標/帕魯樹晶礦),給線上地圖世界樹模式用。
 *
 * 資料來源(維護者為貢獻者,已獲同意;見 public/game-data/CREDITS.md):
 *  - paldb.cc/js/treemap_data_{en,tw,cn,ja}.js 的 `fixedDungeon` 陣列。
 *    四語檔逐 index 對齊(僅 item 欄位有語系差異),`pos` 是原始世界座標(rpos),
 *    直接套 shared 的 savToWorldTreeMap 線性公式映到 ±1000 世界樹底圖
 *    (邊界=config landScapeRealPositionMin/Max;查證紀錄
 *    .claude/notes/worldtree-mapdata-inventory.md、worldtree-map-research.md)。
 *  - 注意:treemap 檔裡只有 ipos 沒有 pos 的條目(Enemy Camp/Anti-Air Turret)
 *    是主世界物件,不在世界樹底圖範圍內,一律略過。
 *
 * 產出(packages/web/public/game-data/):
 *  - worldtree-bosses.json    [{name:{en,zh,"zh-CN",ja}, x, y, lv, icon}](形狀同 bosses.json)
 *  - worldtree-landmarks.json [{type, name:{en,zh,"zh-CN",ja}, x, y, lv?}](形狀同 landmarks.json;
 *                              type 只收前端有圖示的 Fast Travel/Tower)
 *  - worldtree-ores.json      {types:{paloxite:{name,icon,color}}, spots:[{t,x,y}]}(形狀同 ores.json)
 *
 * 用法:node scripts/fetch-worldtree-mapdata.mjs(遊戲改版後重跑再 commit)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "packages/web/public/game-data");
const UA = "palserver-gui-data-sync (maintainer-approved; github.com/io-software-ai/palserver-gui)";

/** shared savToWorldTreeMap 的同式(scripts 不 import TS;改公式兩邊同步,見 shared/src/index.ts)。 */
const TREE_MIN = { x: 347351.5, y: -818197 };
const TREE_SPAN = 689148.5 - 347351.5; // = 341797(X/Y 同跨距,正方形)
const toTreeMap = (posX, posY) => ({
  x: Math.round(((posY - TREE_MIN.y) / TREE_SPAN) * 2000 - 1000),
  y: Math.round(((posX - TREE_MIN.x) / TREE_SPAN) * 2000 - 1000),
});

async function fetchFixedDungeon(locale) {
  const res = await fetch(`https://paldb.cc/js/treemap_data_${locale}.js`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`treemap_data_${locale}.js -> HTTP ${res.status}`);
  const js = await res.text();
  // 單行 minified:`var fixedDungeon=[...];` 取陣列字面值(內容本身是合法 JSON)
  const m = js.match(/fixedDungeon\s*=\s*(\[.*?\])\s*;?\s*(?:var|let|const|$)/s);
  if (!m) throw new Error(`treemap_data_${locale}.js 找不到 fixedDungeon`);
  return JSON.parse(m[1]);
}

const [en, tw, cn, ja] = await Promise.all(["en", "tw", "cn", "ja"].map(fetchFixedDungeon));
for (const [name, arr] of [["tw", tw], ["cn", cn], ["ja", ja]]) {
  if (arr.length !== en.length) throw new Error(`語系檔條目數不齊:en=${en.length} ${name}=${arr.length}`);
}
// 逐 index 對齊防呆:type 必須一致(盤點時已驗證,這裡再擋一次上游改版)
en.forEach((e, i) => {
  if (tw[i].type !== e.type || cn[i].type !== e.type || ja[i].type !== e.type) {
    throw new Error(`第 ${i} 筆四語 type 不一致,上游格式可能變了`);
  }
});

const names = (i) => ({ en: en[i].item, zh: tw[i].item, "zh-CN": cn[i].item, ja: ja[i].item });

// 帕魯圖示對接:Alpha 的 id 去掉 BOSS_ 前綴後不分大小寫對 pals.json
const pals = JSON.parse(await readFile(path.join(DATA_DIR, "pals.json"), "utf8"));
const palByLower = new Map(pals.map((p) => [p.id.toLowerCase(), p]));

const bosses = [];
const landmarks = [];
const spots = [];
const LANDMARK_TYPES = new Set(["Fast Travel", "Tower"]); // 前端 LANDMARK_STYLE 有圖示的類別

en.forEach((e, i) => {
  if (!e.pos) return; // ipos-only = 主世界物件,略過
  const { x, y } = toTreeMap(e.pos.X, e.pos.Y);
  if (e.type === "Alpha Pal") {
    const species = e.id ? palByLower.get(e.id.replace(/^BOSS_/i, "").toLowerCase()) : undefined;
    // 頭目種類:與主世界一致(comment:"Dungeon"=封印領域 sealed,其餘 field)。
    // 世界樹目前全部是 Field,但保留判斷讓日後 paldb 若加封印領域資料能自動分類。
    const kind = e.comment === "Dungeon" ? "sealed" : "field";
    bosses.push({ name: names(i), x, y, kind, ...(e.lv ? { lv: e.lv } : {}), ...(species?.icon ? { icon: species.icon } : {}) });
  } else if (LANDMARK_TYPES.has(e.type)) {
    landmarks.push({ type: e.type, x, y, name: names(i), ...(e.lv ? { lv: e.lv } : {}) });
  } else if (e.type === "Paloxite") {
    spots.push({ t: "paloxite", x, y });
  }
});

// 礦物 types:名稱/圖示對接 items.json 的 WorldTreeOre(帕魯樹晶礦),與 ores.json 同形狀
const items = JSON.parse(await readFile(path.join(DATA_DIR, "items.json"), "utf8"));
const oreItem = items.find((it) => it.id === "WorldTreeOre");
if (!oreItem) throw new Error("items.json 找不到 WorldTreeOre(先跑 game-data 更新)");
const ores = {
  types: {
    paloxite: {
      name: { en: oreItem.name, zh: oreItem.zh, ja: oreItem.ja, zhCN: oreItem["zh-CN"] ?? oreItem.zhCN },
      icon: oreItem.icon,
      color: "#7fe0c8", // 樹晶礦:青綠螢光(底圖深色系上醒目)
    },
  },
  spots,
};

await writeFile(path.join(DATA_DIR, "worldtree-bosses.json"), JSON.stringify(bosses) + "\n");
await writeFile(path.join(DATA_DIR, "worldtree-landmarks.json"), JSON.stringify(landmarks) + "\n");
await writeFile(path.join(DATA_DIR, "worldtree-ores.json"), JSON.stringify(ores) + "\n");
console.log(
  `worldtree-bosses.json: ${bosses.length} 筆(含圖示 ${bosses.filter((b) => b.icon).length})\n` +
    `worldtree-landmarks.json: ${landmarks.length} 筆(${[...new Set(landmarks.map((l) => l.type))].join("/")})\n` +
    `worldtree-ores.json: ${spots.length} 點`,
);
