#!/usr/bin/env node
// /map viewer 頁需要的底圖/地標/頭目/頭像素材,單一素材來源是 packages/web/public
// (GUI 本體也用同一份)。這支腳本在 dev/build 前(見 package.json 的 predev/prebuild)把
// 需要的檔案複製到 website/public/map-assets/ —— 該目錄現在直接進 git(見
// website/.gitignore 的說明:實測 Zeabur 建置環境拿不到 sibling packages/,素材缺了就得
// 先 commit),所以 packages/web 的底圖/地標/圖鑑更新後,記得在本機重跑這支腳本並把
// website/public/map-assets/ 的變動一併 commit。
//
// 為什麼不讓 Next.js 直接讀 ../packages/web/public:App Router 靜態匯出只會打包
// public/ 底下的檔案,跨套件路徑無法被 next build 收進 out/,所以用複製而非引用。
//
// 若 build 環境沒有 sibling packages/ 目錄,這支腳本會印警告後直接結束(exit 0),不讓
// 行銷首頁的 build 因此失敗 —— 代價是本機忘記重跑時,/map 頁會用 git 裡的舊素材。
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '../../packages/web/public');
const DEST_ROOT = path.resolve(__dirname, '../public/map-assets');

/** [來源(相對 packages/web/public), 目的地(相對 map-assets/)] */
const FILES = [
  ['palworld-full-map.jpg', 'palworld-full-map.jpg'],
  ['worldtree-map.webp', 'worldtree-map.webp'],
  ['game-data/landmarks.json', 'landmarks.json'],
  ['game-data/worldtree-landmarks.json', 'worldtree-landmarks.json'],
  ['game-data/landmark-icons/fasttravel.png', 'landmark-icons/fasttravel.png'],
  ['game-data/landmark-icons/tower.png', 'landmark-icons/tower.png'],
  ['game-data/landmark-icons/dungeon.png', 'landmark-icons/dungeon.png'],
  ['game-data/landmark-icons/palbox.webp', 'landmark-icons/palbox.webp'],
  ['game-data/bosses.json', 'bosses.json'],
  ['game-data/worldtree-bosses.json', 'worldtree-bosses.json'],
];

if (!existsSync(SRC_ROOT)) {
  console.warn(
    `[copy-map-assets] 找不到 ${SRC_ROOT} —— 這個環境沒有 monorepo 的 packages/,略過複製。\n` +
      '[copy-map-assets] /map 頁的底圖/地標會缺檔;其餘頁面不受影響。',
  );
  process.exit(0);
}

let ok = 0;
for (const [rel, destRel] of FILES) {
  const from = path.join(SRC_ROOT, rel);
  const to = path.join(DEST_ROOT, destRel);
  if (!existsSync(from)) {
    console.warn(`[copy-map-assets] 缺檔,略過: ${rel}`);
    continue;
  }
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
  ok++;
}
console.log(`[copy-map-assets] 複製 ${ok}/${FILES.length} 個檔案到 ${DEST_ROOT}`);

// ── 帕魯頭像圖檔(玩家頭像 + 野外頭目共用同一個 pals/ 圖庫)──
//
// 「頭像清單」的挑法必須跟 packages/web/src/MapTab.tsx 的 avatarIconUrl()/
// packages/shared/src/pal-avatars.generated.ts 完全一致:pals.json 裡「有 icon」的項目,
// 依檔案原始順序 —— 因為任何 userId 雜湊後都可能選到清單裡任一個,所以要複製「整份候選
// 清單」而不是「只複製目前快照剛好用到的那幾個」。另外野外頭目(bosses.json /
// worldtree-bosses.json)的 icon 也是同一個圖庫的檔名,但偶爾會引用到不在玩家頭像候選
// 清單裡的圖(例如 Alpha 專屬的變體圖檔),一併聯集進來,不能只看頭像清單。
const palsJsonPath = path.join(SRC_ROOT, 'game-data/pals.json');
const iconFiles = new Set();
try {
  const pals = JSON.parse(readFileSync(palsJsonPath, 'utf8'));
  for (const p of pals) if (p && typeof p.icon === 'string' && p.icon) iconFiles.add(p.icon);
} catch {
  console.warn(`[copy-map-assets] 讀不到 ${palsJsonPath},跳過頭像圖庫複製。`);
}
// 再聯集 packages/shared 的「凍結」頭像清單(pal-avatars.generated.ts)—— 這才是 agent 端
// pickPalAvatarIcon 真正會送出的檔名來源。pals.json 若被單邊更新(新增/刪除/重排有 icon 的
// 帕魯)卻沒重跑 gen-pal-avatars.mjs 重生成這份凍結清單,只讀 pals.json 會漏掉 agent 仍在送的
// 舊檔名 → viewer 對那些頭像 404。兩邊聯集(複製超集)確保不論哪一份為準都不缺檔。
const generatedPath = path.resolve(SRC_ROOT, '../../shared/src/pal-avatars.generated.ts');
try {
  const src = readFileSync(generatedPath, 'utf8');
  for (const m of src.matchAll(/["']([^"']+\.(?:png|webp|jpg|jpeg))["']/g)) iconFiles.add(m[1]);
} catch {
  console.warn(`[copy-map-assets] 讀不到 ${generatedPath},只用 pals.json 推導頭像清單(agent 端凍結清單若已分歧,可能漏檔)。`);
}
for (const bossFile of ['game-data/bosses.json', 'game-data/worldtree-bosses.json']) {
  try {
    const bosses = JSON.parse(readFileSync(path.join(SRC_ROOT, bossFile), 'utf8'));
    for (const b of bosses) if (b && typeof b.icon === 'string' && b.icon) iconFiles.add(b.icon);
  } catch {
    // bosses.json 本身已經在上面的 FILES 迴圈報過缺檔,這裡不重複警告。
  }
}

let iconOk = 0;
for (const icon of iconFiles) {
  const from = path.join(SRC_ROOT, 'game-data/pals', icon);
  const to = path.join(DEST_ROOT, 'pal-avatars', icon);
  if (!existsSync(from)) {
    console.warn(`[copy-map-assets] 缺帕魯頭像圖檔,略過: game-data/pals/${icon}`);
    continue;
  }
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
  iconOk++;
}
console.log(`[copy-map-assets] 複製 ${iconOk}/${iconFiles.size} 個帕魯頭像圖檔到 ${path.join(DEST_ROOT, 'pal-avatars')}`);
