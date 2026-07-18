// 給 bosses.json 每筆加 kind:"field"|"sealed",來源 paldb Alpha Pal 的 comment
// (Field→field 真野外頭目;Dungeon→sealed 封印領域頭目)。用「英文名 item」對照 +
// index 對齊雙重驗證,確保不錯配。只讀 paldb + 寫回 game-data 兩個 json。
import fs from "node:fs";

const GD = "/Users/eason/Studio/projects/palserver-gui/packages/web/public/game-data";

function extractFixedDungeon(src) {
  const m = src.match(/(?:var|let|const)?\s*fixedDungeon\s*=\s*/);
  const start = src.indexOf("[", m.index + m[0].length - 1);
  let depth = 0, inStr = false, ch = "", esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === ch) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; ch = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return eval(src.slice(start, i + 1)); }
  }
}

async function alphaComments(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  const src = await res.text();
  return extractFixedDungeon(src).filter((e) => e.type === "Alpha Pal");
}

function enrich(jsonPath, alpha, label) {
  const bosses = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  console.log(`\n=== ${label}: bosses.json=${bosses.length} 筆, paldb Alpha Pal=${alpha.length} 筆 ===`);
  // 正確 join key:座標。bosses.json 的 x,y 就是 paldb ipos.X,ipos.Y(見 fetch-zh-cn.mjs
  // 用 `${entry.x}|${entry.y}` 對 byXYAlphaPal 填 zhCN)。座標語言無關,用 en 檔即可。
  const byXY = new Map();
  for (const a of alpha) {
    if (!a.ipos) continue;
    byXY.set(`${a.ipos.X}|${a.ipos.Y}`, a.comment);
  }
  let field = 0, sealed = 0, matched = 0, miss = 0;
  const out = bosses.map((b) => {
    const comment = byXY.get(`${b.x}|${b.y}`);
    if (comment != null) matched++; else { miss++; console.log(`  座標未配對(預設 field): ${b.name.en} @(${b.x},${b.y})`); }
    const kind = comment === "Dungeon" ? "sealed" : "field";
    if (kind === "sealed") sealed++; else field++;
    return { ...b, kind };
  });
  console.log(`  結果: field=${field} sealed=${sealed} | 座標配對=${matched}/${bosses.length}, 未配對=${miss}`);
  const sealedNames = out.filter((b) => b.kind === "sealed").map((b) => b.name.en).sort();
  console.log(`  sealed 全名單(${sealedNames.length}): ${sealedNames.join(", ")}`);
  fs.writeFileSync(jsonPath, JSON.stringify(out) + "\n");
  console.log(`  已寫回 ${jsonPath}`);
  return { field, sealed };
}

// 投查報告確認的 18 筆 sealed 頭目(name.en),用來交叉驗證
const EXPECTED_SEALED = new Set(["Neptilius","Verdash","Penking","Caprity Noct","Nitemary","Smokie","Wixen","Foxcicle","Lunaris","Sibelyx","Vaelet","Wistella","Bushi","Tetroise Primo","Blazehowl","Arsox","Prunelia","Foxparks Cryst"]);
globalThis.__EXPECTED = EXPECTED_SEALED;

const mainAlpha = await alphaComments("https://paldb.cc/js/map_data_en.js");
enrich(`${GD}/bosses.json`, mainAlpha, "主世界");

const treeAlpha = await alphaComments("https://paldb.cc/js/treemap_data_en.js");
enrich(`${GD}/worldtree-bosses.json`, treeAlpha, "世界樹");
