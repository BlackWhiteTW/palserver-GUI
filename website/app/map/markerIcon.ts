// 公開地圖 viewer 的 Leaflet icon 產生器 —— 逐一對齊 packages/web/src/MapTab.tsx 的四套
// marker 系統(玩家頭像 pmap-avatar、公會據點 pmap-base、野外頭目 pmap-boss、靜態地標的
// 原生 L.icon)。對應的 CSS 定義在 map.css,class 前綴 pmap2- 只是本站的命名空間,規則內容
// (尺寸/邊框寬度/陰影/hover/動畫)逐一比對 packages/web/src/styles.css 抄過來,只把背景色
// token 換成本站的 --card/--card-2(兩邊 CSS 變數系統不同,但取的是同一組近白/近黑「卡片
// 底色」語意)。地標(Fast Travel/Tower/Dungeon)GUI 端完全沒有徽章包裝,原樣是一張置中的
// <img>,所以 viewer 這邊也不經過這支檔案 —— 直接在 LeafletMap.tsx 用 L.icon() 構造。

import * as L from 'leaflet';

const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');

/** 每個名字專屬的識別色(HSL hash)—— 玩家沒有 icon 時的首字母徽章底色 fallback,
 *  以及舊快照(沒有 c 欄位)的公會據點配色 fallback。演算法照抄 GUI 的
 *  guildColor/avatarIconUrl 雜湊(這個 app 不是 @palserver/shared 的 workspace 成員,
 *  沒辦法 import 共用 helper,只能維持這份獨立複本 —— 見 packages/shared/src/map-helpers.ts
 *  的同名演算法)。 */
export function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 70% 52%)`;
}

/** 首字母(白字置中的 fallback 徽章內容)。 */
function initialChar(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}

/** 徽章旁的名字標籤(showNames 開啟時,玩家頭像旁常駐顯示的名字牌)。 */
export function nameLabelHtml(escapedName: string, size: number, opts: { offline?: boolean } = {}): string {
  const top = Math.round(size / 2 - 9);
  return `<span class="pmap2-label${opts.offline ? ' pmap2-label-offline' : ''}" style="left:${size + 4}px;top:${top}px">${escapedName}</span>`;
}

// ── 玩家 / 離線玩家頭像 —— 對齊 MapTab.tsx 的 pmap-avatar 系列 ──
// GUI 原始參數(MapTab.tsx:1122-1199、styles.css:433-483):SIZE=40、圓形、2px 描邊
// (線上白 #fff / 離線灰 #8a94a3)、box-shadow 0 1px 5px rgb(0 0 0/.45)、hover scale(1.12)、
// 有 icon 用 <img object-fit:cover> 填滿,沒有就是空白圓圈(GUI 沒有字母 fallback;viewer
// 因為「沒有真人頭像」這件事在 icon 幾乎必存在後已經是罕見的過渡態,保留字母 fallback 是
// 刻意的既有設計,不是要跟 GUI 逐位元一致的地方)。離線用 pmap-avatar.pmap-offline
// (opacity .5、grayscale .45、換一組較淡的陰影);偷襲警告用 pmap-avatar.pmap-raid
// (脈動紅色 halo)。

export const PLAYER_AVATAR_SIZE = 40;

export function playerAvatarIcon(opts: {
  iconUrl: string | null;
  name: string;
  ring: string;
  offline?: boolean;
  raid?: boolean;
  labelHtml?: string;
}): L.DivIcon {
  const SIZE = PLAYER_AVATAR_SIZE;
  const cls = ['pmap2-avatar'];
  if (opts.offline) cls.push('pmap2-avatar-offline');
  if (opts.raid) cls.push('pmap2-avatar-raid');
  // 字級用 px 內聯算(跟著徽章尺寸縮放),不是 CSS 百分比 —— 百分比會相對「繼承下來的
  // font-size」算,不會相對徽章本身的像素尺寸,尺寸一多階層就會算錯。
  const fontSize = Math.round(SIZE * 0.42);
  // 有 icon 時背景色跟 GUI 一樣固定用卡片色(圖片會蓋滿,背景幾乎看不到);沒有 icon 的
  // 罕見過渡態(gameData 還沒載完之類)才用「每個名字專屬的識別色」當底,維持舊版 viewer
  // 「沒有真人頭像,靠顏色分辨玩家」的既有設計,不是要跟 GUI 逐位元一致的地方。
  const bg = opts.iconUrl ? '' : `background:${hashColor(opts.name)};`;
  const inner = opts.iconUrl
    ? `<img src="${escapeAttr(opts.iconUrl)}" alt="" />`
    : `<span class="pmap2-avatar-initial" style="font-size:${fontSize}px">${initialChar(opts.name)}</span>`;
  return L.divIcon({
    className: 'pmap2-avatar-wrap',
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
    tooltipAnchor: [0, -SIZE / 2],
    html:
      `<span class="${cls.join(' ')}" style="width:${SIZE}px;height:${SIZE}px;border-color:${opts.ring};${bg}">${inner}</span>` +
      (opts.labelHtml ?? ''),
  });
}

// ── 公會據點 —— 對齊 MapTab.tsx 的 pmap-base 系列 ──
// GUI 原始參數(MapTab.tsx:1093-1120、styles.css:486-507):32x32 圓角方形(border-radius
// 10px,不是圓形!)、3px 描邊(guild 配色)、3px padding、box-shadow 0 1px 4px
// rgb(0 0 0/.45)、Palbox 圖示 object-fit:contain + drop-shadow(0 1px 1px rgb(0 0 0/.4))、
// 沒有 hover 縮放效果(GUI 沒定義)。

export const BASE_MARKER_SIZE = 32;

export function baseMarkerIcon(color: string): L.DivIcon {
  const SIZE = BASE_MARKER_SIZE;
  return L.divIcon({
    className: 'pmap2-base-wrap',
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
    tooltipAnchor: [0, -SIZE / 2],
    html:
      `<span class="pmap2-base" style="border-color:${color}">` +
      `<img src="/map-assets/landmark-icons/palbox.webp" alt="" />` +
      `</span>`,
  });
}

// ── 頭目 —— 對齊 MapTab.tsx 的 pmap-boss 系列,依 kind 分兩種樣式 ──
// GUI 原始參數(MapTab.tsx:1058-1087、styles.css:509-567):36x36 圓形、2.5px 紅框
// (#e05b5b)、box-shadow 雙層(紅色暈 + 黑色陰影)、hover scale(1.12)、頭像
// object-fit:cover、頂端皇冠徽章(16x16 圓形、紅底金色 svg)、底部等級藥丸
// (紅底白字)。svg path 與尺寸原樣照抄 —— 這是 'field'(野外頭目/Alpha Pal)的樣式。
//
// 'sealed'(封印領域/Sealed Realm)是本站新增、GUI 端沒有對應物:同樣 36x36 圓形頭像 +
// 等級藥丸,但改紫色框(#9b6bef)與傳送門/菱形徽章,讓兩種頭目在地圖上一眼可分辨
// (對齊 palworld.gg 的分類方式)。class 前綴沿用 pmap2-boss,用 pmap2-boss--sealed
// 修飾詞覆寫框色/暈色,徽章另開 pmap2-boss-badge--sealed 換圖示與底色。

export const BOSS_MARKER_SIZE = 36;

export function bossMarkerIcon(iconUrl: string | null, lv: number | undefined, kind?: 'field' | 'sealed'): L.DivIcon {
  const BS = BOSS_MARKER_SIZE;
  const sealed = kind === 'sealed';
  const wrapCls = sealed ? 'pmap2-boss pmap2-boss--sealed' : 'pmap2-boss';
  const badgeCls = sealed ? 'pmap2-boss-badge pmap2-boss-badge--sealed' : 'pmap2-boss-badge';
  const lvCls = sealed ? 'pmap2-boss-lv pmap2-boss-lv--sealed' : 'pmap2-boss-lv';
  // 皇冠(field):照抄 GUI 原樣。傳送門/菱形(sealed):同心菱形輪廓,暗示「封印門」,
  // 不用 emoji、不借用皇冠造型,一眼跟 field 區分開。
  const badgeSvg = sealed
    ? `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 2L22 12L12 22L2 12Z"/><path d="M12 8L16 12L12 16L8 12Z" fill="currentColor" stroke="none"/></svg>`
    : `<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M4 17l-2-10 5.5 4L12 4l4.5 7L22 7l-2 10z"/></svg>`;
  return L.divIcon({
    className: 'pmap2-boss-wrap',
    iconSize: [BS, BS],
    iconAnchor: [BS / 2, BS / 2],
    tooltipAnchor: [0, -BS / 2],
    html:
      `<span class="${wrapCls}" style="width:${BS}px;height:${BS}px">` +
      (iconUrl ? `<img src="${escapeAttr(iconUrl)}" alt="" />` : '') +
      `<span class="${badgeCls}">${badgeSvg}</span>` +
      (lv ? `<span class="${lvCls}">${lv}</span>` : '') +
      `</span>`,
  });
}
