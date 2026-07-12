#!/usr/bin/env node
/**
 * 把「新條目」安全合併進 pals.json / items.json,並下載對應圖示。
 * 只「新增」既有 catalog 沒有的 id,絕不改動或覆蓋既有條目(既有英文名有人工修正、
 * 既有 id 對接玩家資料)。圖示下載失敗就拿掉該筆的 icon 欄,避免前端破圖。
 *
 * 用法:
 *   node scripts/merge-new-catalog-entries.mjs <items|pals> <new-entries.json> [--dry]
 *
 * new-entries.json 格式:[{ id, name, zh?, ja?, icon, iconUrl }]
 * (icon = 存檔用的檔名 = iconUrl 的 basename;iconUrl = 完整圖片 URL)
 *
 * 新條目怎麼爬,見 docs/game-data-maintenance.md。
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "packages/web/public/game-data");
const UA = "palserver-gui-data-sync (maintainer-approved; github.com/io-software-ai/palserver-gui)";

const [kind, newFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
if (!["items", "pals"].includes(kind) || !newFile) {
  console.error("用法: node scripts/merge-new-catalog-entries.mjs <items|pals> <new-entries.json> [--dry]");
  process.exit(1);
}
const catalogFile = `${kind}.json`;
const iconDir = kind;

const exists = (p) => access(p, constants.F_OK).then(() => true, () => false);
const order = (e) => ({
  id: e.id,
  name: e.name,
  ...(e.icon ? { icon: e.icon } : {}),
  ...(e.zh ? { zh: e.zh } : {}),
  ...(e.ja ? { ja: e.ja } : {}),
});

const catalog = JSON.parse(await readFile(path.join(DATA, catalogFile), "utf8"));
const have = new Set(catalog.map((e) => e.id));
const incoming = JSON.parse(await readFile(path.resolve(newFile), "utf8"));

const before = catalog.length;
const added = [];
const fails = [];
let iconOk = 0;
let iconSkip = 0;

for (const raw of incoming) {
  if (!raw?.id || have.has(raw.id)) continue; // 只加差集,既有 id 一律略過
  if (!raw.name || raw.name === "-") {
    fails.push(`${raw.id} (no name)`);
    continue;
  }
  have.add(raw.id);
  added.push(raw.id);
  let iconLanded = false;
  if (raw.icon && raw.iconUrl) {
    const dest = path.join(DATA, iconDir, raw.icon);
    if (await exists(dest)) {
      iconLanded = true;
      iconSkip++;
    } else if (DRY) {
      iconLanded = true;
    } else {
      try {
        const r = await fetch(raw.iconUrl, { headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 100) throw new Error(`tiny ${buf.length}b`);
        await writeFile(dest, buf);
        iconOk++;
        iconLanded = true;
      } catch (err) {
        fails.push(`${raw.id} icon:${err.message}`);
      }
    }
  } else {
    fails.push(`${raw.id} (no iconUrl)`);
  }
  // 圖示沒到手就拿掉 icon 欄,前端 fallback 不會指向不存在的檔案。
  catalog.push(order(iconLanded ? raw : { ...raw, icon: undefined }));
}

const ordered = catalog.map(order);
if (!DRY) await writeFile(path.join(DATA, catalogFile), JSON.stringify(ordered) + "\n");

console.log(
  `${catalogFile}: ${before} -> ${ordered.length} (+${added.length}); ` +
    `icons dl ${iconOk} skip ${iconSkip} fail ${fails.length}${DRY ? " [DRY]" : ""}`,
);
if (fails.length) console.log("  沒圖/略過:", fails.slice(0, 40).join(" | "));
