// 由 packages/web/public/game-data/{pals,bosses,worldtree-bosses}.json 生成
// packages/shared/src/game-names.generated.ts —— 讓 agent / bot(在 SEA 或 standalone,
// 拿不到 web 的 game-data)也能把怕魯名、頭目名在地化成四語。
// 單一真實來源是 web 的 game-data JSON;改名字改那邊、重跑 `pnpm --filter @palserver/shared gen:game-names`。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const gameDataDir = path.join(repoRoot, "packages", "web", "public", "game-data");
const read = (f) => JSON.parse(fs.readFileSync(path.join(gameDataDir, f), "utf8"));

// ── 怕魯名:pals.json 的 {id, name(en), zh, zh-CN, ja} → 以「小寫顯示名」與「小寫 id」為鍵 ──
const pals = read("pals.json");
const palMap = {};
for (const p of pals) {
  const names = { en: p.name, ja: p.ja || p.name, "zh-TW": p.zh || p.name, "zh-CN": p["zh-CN"] || p.zh || p.name };
  for (const key of [p.name, p.id]) {
    if (typeof key === "string" && key) palMap[key.toLowerCase()] = names;
  }
}

// ── 頭目名:bosses.json + worldtree-bosses.json 的 {name:{en,zh,zh-CN,ja}, x, y} → 座標點清單 ──
const bossFiles = ["bosses.json", "worldtree-bosses.json"].filter((f) =>
  fs.existsSync(path.join(gameDataDir, f)),
);
const bossPoints = [];
const seen = new Set();
for (const f of bossFiles) {
  for (const b of read(f)) {
    const key = `${b.x},${b.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bossPoints.push({
      x: b.x,
      y: b.y,
      names: {
        en: b.name.en,
        ja: b.name.ja || b.name.en,
        "zh-TW": b.name.zh || b.name.en,
        "zh-CN": b.name["zh-CN"] || b.name.zh || b.name.en,
      },
    });
  }
}

const body =
  "// 自動生成,請勿手動編輯。改內容請改 packages/web/public/game-data/{pals,bosses,worldtree-bosses}.json,\n" +
  "// 再跑 `pnpm --filter @palserver/shared gen:game-names`。\n" +
  "import type { BotLang } from \"./game-names.js\";\n\n" +
  `export const PAL_NAMES: Record<string, Record<BotLang, string>> = ${JSON.stringify(palMap)};\n\n` +
  `export const BOSS_NAME_POINTS: { x: number; y: number; names: Record<BotLang, string> }[] = ${JSON.stringify(bossPoints)};\n`;

const outPath = path.join(repoRoot, "packages", "shared", "src", "game-names.generated.ts");
fs.writeFileSync(outPath, body);
console.log(`gen-game-names → ${path.relative(repoRoot, outPath)} (pals=${Object.keys(palMap).length} keys, bosses=${bossPoints.length} points)`);
