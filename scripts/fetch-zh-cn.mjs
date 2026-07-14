#!/usr/bin/env node
/**
 * 從 paldb.cc 的簡體中文站(/cn/)抓官方簡中譯名,補進遊戲資料 JSON 的 `zhCN` 欄位。
 *
 * 背景:paldb.cc 的 /tw/ 是繁體中文,/cn/ 是「另一個獨立語言版本」的簡體中文
 * (不是 /tw/ 的繁轉簡,實測部分譯名用詞不同,例如帕魯名稱、道具名稱都各自維護),
 * 所以簡中要獨立抓,不能只靠 zh 欄位繁轉簡。
 *
 * 涵蓋六個資料檔:
 *  - pals.json / items.json:靠 `<a class="itemname" data-hover="?s=<Kind>%2F<id>">` 的
 *    內部 id 直接對接(可靠),做法與 fetch-game-data-i18n.mjs 相同,只是站點換 /cn/。
 *  - activeSkills.json:靠 `EPalWazaID::<id>` anchor 直接對接(可靠),做法與
 *    fetch-skills-passives.mjs 的主動技部分相同,只是加抓 /cn/Active_Skills。
 *  - passives.json:paldb 詞條頁沒有專屬 id,只能用「en/cn 卡片數量相同」的位置對應
 *    (與 zh 欄位當初的做法相同),已用 rank 逐一核對過 en/cn 卡片順序一致才安全。
 *  - landmarks.json / bosses.json:靠 `https://paldb.cc/js/map_data_cn.js` 裡
 *    `fixedDungeon` 陣列的 `ipos:{X,Y}` 座標比對(座標跨語言不變,比對 type+x+y 即可,
 *    比對到再取當筆 cn 的 `item` 顯示名)。經實測,座標比對比既有 bosses.json 內建的
 *    id 前綴比對法更完整(例如 Anubis/Dualith Noct 等既有 zh 未翻譯的 boss,靠座標比對
 *    在 cn 來源都能抓到正確譯名)。
 *
 * 只新增 `zhCN` 欄位,不覆蓋既有欄位;抓不到 cn 對應的條目留給後續 OpenCC 繁轉簡 fallback
 * 處理(見 docs/game-data-maintenance.md「補簡體中文 zhCN 欄位」一節)。
 *
 * 用法:node scripts/fetch-zh-cn.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "packages/web/public/game-data");
const UA = "palserver-gui-data-sync (maintainer-approved; github.com/io-software-ai/palserver-gui)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

async function getSequential(urls) {
  const out = [];
  for (const url of urls) {
    if (out.length > 0) await sleep(400);
    out.push(await get(url));
  }
  return out;
}

/** 索引頁:data-hover="?s=<kind>%2F<內部ID>" 的連結文字就是該語言名稱。 */
function parseNames(html, kind) {
  const names = new Map();
  const re = new RegExp(
    `<a class="itemname" data-hover="\\?s=${kind}%2F([^"]+)"[^>]*>(.*?)</a>`,
    "gs",
  );
  for (const [, rawId, rawName] of html.matchAll(re)) {
    const id = decodeURIComponent(rawId);
    const name = rawName.replace(/<[^>]*>/g, "").trim();
    if (name && !names.has(id)) names.set(id, name);
  }
  return names;
}

/** 主動技:EPalWazaID::<id> anchor -> 名稱。 */
function parsePaldbWaza(html) {
  const names = new Map();
  const re = /data-hover="\?s=Waza%2FEPalWazaID%3A%3A([^"]+)"[^>]*>((?:[^<]|<(?!\/a>))*)<\/a>/g;
  for (const [, id, rawName] of html.matchAll(re)) {
    const name = rawName.replace(/<[^>]*>/g, "").trim();
    if (name && !names.has(id)) names.set(decodeURIComponent(id), name);
  }
  return names;
}

/** 詞條清單(位置對應用):paldb.cc/{lang}/Passive_Skills 的「Pal Passive Skills」分頁卡片。 */
function parsePaldbPassiveList(html) {
  const headerRe = /<h5 class="card-header">[^<]*\/\d+/g;
  const first = headerRe.exec(html);
  if (!first) return [];
  const second = headerRe.exec(html);
  const section = html.slice(first.index, second ? second.index : html.length);
  const out = [];
  for (const m of section.matchAll(/class="passive-rank(-?\d+) ps-2 py-1">([^<]*)<\/div>/g)) {
    out.push({ rank: Number(m[1]), name: m[2] });
  }
  return out;
}

/** 把 map_data_<lang>.js 的 fixedDungeon 陣列解析成 marker 物件清單(允許 ipos 這層巢狀)。 */
function parseMapMarkers(js) {
  const out = [];
  for (const m of js.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)) {
    const raw = m[0];
    if (!raw.includes('"ipos"')) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* 略過解析失敗的片段 */
    }
  }
  return out;
}

async function fillCatalogZhCN(file, page, kind) {
  const catalog = JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
  const html = await get(`https://paldb.cc/cn/${page}`);
  const names = parseNames(html, kind);
  let filled = 0;
  let missing = 0;
  for (const entry of catalog) {
    const name = names.get(entry.id);
    if (name) {
      if (entry.zhCN !== name) {
        entry.zhCN = name;
        filled++;
      }
    } else if (!entry.zhCN) {
      missing++;
    }
  }
  const ordered = catalog.map(({ id, name, icon, zh, ja, zhCN, ...rest }) => ({
    id,
    name,
    ...(icon ? { icon } : {}),
    ...(zh ? { zh } : {}),
    ...(ja ? { ja } : {}),
    ...(zhCN ? { zhCN } : {}),
    ...rest,
  }));
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(ordered) + "\n");
  console.log(`${file}: ${catalog.length} 筆, cn 直接對到 ${filled} 筆, 未對到 ${missing} 筆(留給 OpenCC fallback)`);
}

async function fillActiveSkillsZhCN() {
  const file = "activeSkills.json";
  const catalog = JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
  const html = await get("https://paldb.cc/cn/Active_Skills");
  const names = parsePaldbWaza(html);
  let filled = 0;
  let missing = 0;
  for (const entry of catalog) {
    const name = names.get(entry.id);
    if (name) {
      if (entry.zhCN !== name) {
        entry.zhCN = name;
        filled++;
      }
    } else if (!entry.zhCN) {
      missing++;
    }
  }
  const ordered = catalog.map(({ id, name, zh, ja, zhCN, element, ...rest }) => ({
    id,
    name,
    ...(zh ? { zh } : {}),
    ...(ja ? { ja } : {}),
    ...(zhCN ? { zhCN } : {}),
    ...(element ? { element } : {}),
    ...rest,
  }));
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(ordered) + "\n");
  console.log(`${file}: ${catalog.length} 筆, cn 直接對到 ${filled} 筆, 未對到 ${missing} 筆(留給 OpenCC fallback)`);
}

async function fillPassivesZhCN() {
  const file = "passives.json";
  const catalog = JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
  const [enHtml, cnHtml] = await getSequential([
    "https://paldb.cc/en/Passive_Skills",
    "https://paldb.cc/cn/Passive_Skills",
  ]);
  const enList = parsePaldbPassiveList(enHtml);
  const cnList = parsePaldbPassiveList(cnHtml);
  let filled = 0;
  let missing = 0;
  if (enList.length !== cnList.length) {
    console.warn(
      `[警告] paldb en/cn 詞條卡片數量不一致(en ${enList.length} / cn ${cnList.length}),位置對應不安全,本次跳過 zhCN 位置對應,全部留給 OpenCC fallback。`,
    );
    missing = catalog.length - catalog.filter((p) => p.zhCN).length;
  } else {
    const enIndexByName = new Map();
    enList.forEach((e, i) => {
      if (!enIndexByName.has(e.name)) enIndexByName.set(e.name, i);
    });
    for (const entry of catalog) {
      const idx = enIndexByName.get(entry.name);
      const zhCN = idx !== undefined ? cnList[idx]?.name : undefined;
      if (zhCN) {
        if (entry.zhCN !== zhCN) {
          entry.zhCN = zhCN;
          filled++;
        }
      } else if (!entry.zhCN) {
        missing++;
      }
    }
  }
  const ordered = catalog.map(({ id, name, zh, zhCN, rank, ...rest }) => ({
    id,
    name,
    ...(zh ? { zh } : {}),
    ...(zhCN ? { zhCN } : {}),
    rank,
    ...rest,
  }));
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(ordered) + "\n");
  console.log(`${file}: ${catalog.length} 筆, cn 位置對應到 ${filled} 筆, 未對到 ${missing} 筆(留給 OpenCC fallback)`);
}

async function fillLandmarksAndBossesZhCN() {
  const mapJs = await get("https://paldb.cc/js/map_data_cn.js");
  const markers = parseMapMarkers(mapJs);
  const byTypeXY = new Map();
  const byXYAlphaPal = new Map();
  for (const m of markers) {
    if (!m.type || !m.ipos) continue;
    const x = m.ipos.X;
    const y = m.ipos.Y;
    const item = typeof m.item === "string" ? m.item : "";
    byTypeXY.set(`${m.type}|${x}|${y}`, item);
    if (m.type === "Alpha Pal") byXYAlphaPal.set(`${x}|${y}`, item);
  }

  // landmarks.json:{type,x,y,lv?,name:{en,zh,ja}}
  {
    const file = "landmarks.json";
    const catalog = JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
    let filled = 0;
    let missing = 0;
    for (const entry of catalog) {
      const key = `${entry.type}|${entry.x}|${entry.y}`;
      const zhCN = byTypeXY.get(key);
      if (zhCN) {
        if (entry.name.zhCN !== zhCN) {
          entry.name.zhCN = zhCN;
          filled++;
        }
      } else if (!entry.name.zhCN) {
        missing++;
      }
    }
    const ordered = catalog.map((e) => {
      const { en, zh, ja, zhCN, ...restName } = e.name;
      return {
        ...e,
        name: {
          en,
          ...(zh !== undefined ? { zh } : {}),
          ...(ja !== undefined ? { ja } : {}),
          ...(zhCN ? { zhCN } : { zhCN: "" }),
          ...restName,
        },
      };
    });
    await writeFile(path.join(DATA_DIR, file), JSON.stringify(ordered) + "\n");
    console.log(
      `${file}: ${catalog.length} 筆, 座標對到 ${filled} 筆, 未對到 ${missing} 筆(多為遊戲內本來就無名稱的地標,見報告)`,
    );
  }

  // bosses.json:{name:{en,zh,ja},x,y,lv?,icon?}
  {
    const file = "bosses.json";
    const catalog = JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
    let filled = 0;
    let missing = 0;
    for (const entry of catalog) {
      const zhCN = byXYAlphaPal.get(`${entry.x}|${entry.y}`);
      if (zhCN) {
        if (entry.name.zhCN !== zhCN) {
          entry.name.zhCN = zhCN;
          filled++;
        }
      } else if (!entry.name.zhCN) {
        missing++;
      }
    }
    const ordered = catalog.map((e) => {
      const { en, zh, ja, zhCN, ...restName } = e.name;
      return {
        name: {
          en,
          ...(zh !== undefined ? { zh } : {}),
          ...(ja !== undefined ? { ja } : {}),
          ...(zhCN ? { zhCN } : {}),
          ...restName,
        },
        ...Object.fromEntries(Object.entries(e).filter(([k]) => k !== "name")),
      };
    });
    await writeFile(path.join(DATA_DIR, file), JSON.stringify(ordered) + "\n");
    console.log(`${file}: ${catalog.length} 筆, 座標對到 ${filled} 筆, 未對到 ${missing} 筆(留給 OpenCC fallback)`);
  }
}

await fillCatalogZhCN("items.json", "Items", "Items");
await fillCatalogZhCN("pals.json", "Pals", "Pals");
await fillActiveSkillsZhCN();
await fillPassivesZhCN();
await fillLandmarksAndBossesZhCN();
