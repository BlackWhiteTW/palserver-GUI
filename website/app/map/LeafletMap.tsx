'use client';

import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMapDict, pickLocalizedName, type MapLang } from './i18n';
import type { MapSnapshotV1, MapWorld, StaticBoss, StaticLandmark } from './types';
import { bossMarkerIcon, baseMarkerIcon, hashColor, nameLabelHtml, playerAvatarIcon, PLAYER_AVATAR_SIZE } from './markerIcon';

// 底圖與座標邊界:原樣抄自 packages/web/src/MapTab.tsx:36-52(GUI 本體的即時地圖用
// 同一組常數)。快照裡的 x/y 已經是 agent 端算好的「地圖座標」,不是存檔原始世界座標,
// 所以這裡不需要 savToMap/savToWorldTreeMap 轉換,直接當 [y, x] 丟給 Leaflet 即可。
const MAP_IMAGE = '/map-assets/palworld-full-map.jpg';
const IMAGE_BOUNDS = L.latLngBounds([-2125.3, -1922.44], [1031.13, 1233.99]);
const TREE_MAP_IMAGE = '/map-assets/worldtree-map.webp';
const TREE_IMAGE_BOUNDS = L.latLngBounds([-1000, -1000], [1000, 1000]);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** 帕魯圖鑑頭像的完整 URL —— 快照/靜態 JSON 裡只帶裸檔名(game-data/pals/ 內的檔名),
 *  copy-map-assets.mjs 把被引用到的檔案複製進 /map-assets/pal-avatars/。 */
const palAvatarUrl = (icon: string) => `/map-assets/pal-avatars/${icon}`;

/** 靜態地標(Fast Travel / Tower / Dungeon):圖示資產、尺寸原樣照抄
 * packages/web/src/MapTab.tsx 的 LANDMARK_STYLE(:88-92)。GUI 端這層完全沒有徽章包裝
 * (L.icon 直接是一張置中的 <img>,無外框/無陰影),這裡刻意不經過 markerIcon.ts 的
 * badge 產生器,原樣重現。 */
const LANDMARK_STYLE: Record<string, { icon: string; size: number }> = {
  'Fast Travel': { icon: '/map-assets/landmark-icons/fasttravel.png', size: 26 },
  Tower: { icon: '/map-assets/landmark-icons/tower.png', size: 30 },
  Dungeon: { icon: '/map-assets/landmark-icons/dungeon.png', size: 22 },
};

export default function LeafletMap({
  world,
  snapshot,
  landmarks,
  treeLandmarks,
  bosses,
  treeBosses,
  showPlayers,
  showOffline,
  showBases,
  showLandmarks,
  showBosses,
  showNames,
  showGuildNames,
  lang,
}: {
  world: MapWorld;
  snapshot: MapSnapshotV1;
  landmarks: StaticLandmark[];
  treeLandmarks: StaticLandmark[];
  bosses: StaticBoss[];
  treeBosses: StaticBoss[];
  showPlayers: boolean;
  showOffline: boolean;
  showBases: boolean;
  showLandmarks: boolean;
  showBosses: boolean;
  showNames: boolean;
  showGuildNames: boolean;
  lang: MapLang;
}) {
  const d = getMapDict(lang);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBounds>(IMAGE_BOUNDS);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // 建圖(只跑一次):CRS.Simple + 空的 marker layer group,底圖交給下面的 world effect。
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, {
      crs: L.CRS.Simple,
      attributionControl: false,
      zoomSnap: 0.25,
      maxZoom: 4,
    });
    map.setView(IMAGE_BOUNDS.getCenter(), -2);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    let fitted = false;
    const applySize = () => {
      map.invalidateSize();
      if (map.getSize().y === 0) return;
      map.setMinZoom(map.getBoundsZoom(boundsRef.current) - 1);
      if (!fitted) {
        map.fitBounds(boundsRef.current);
        fitted = true;
      }
    };
    const ro = new ResizeObserver(applySize);
    ro.observe(el);
    applySize();

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // 底圖切換(主世界 / 世界樹):換 overlay 與邊界,重新 fit。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = world === 'tree' ? TREE_IMAGE_BOUNDS : IMAGE_BOUNDS;
    boundsRef.current = bounds;
    const overlay = L.imageOverlay(world === 'tree' ? TREE_MAP_IMAGE : MAP_IMAGE, bounds).addTo(map);
    overlay.bringToBack();
    map.setMaxBounds(bounds.pad(0.3));
    if (map.getSize().y > 0) {
      map.setMinZoom(map.getBoundsZoom(bounds) - 1);
      map.fitBounds(bounds);
    }
    return () => {
      map.removeLayer(overlay);
    };
  }, [world]);

  // 畫標記:玩家(在線/離線)、公會據點、野外頭目、靜態地標。快照數量小(<100),
  // DOM marker 就夠。
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();

    const inWorld = (m: string | undefined) => (m === 'tree') === (world === 'tree');
    const curLandmarks = world === 'tree' ? treeLandmarks : landmarks;
    const curBosses = world === 'tree' ? treeBosses : bosses;

    // 靜態地標(Fast Travel / Tower / Dungeon):跟 GUI 一樣完全沒有徽章包裝,直接是
    // 一張置中的 <img>(L.icon,不經過 markerIcon.ts 的 divIcon 產生器)。
    if (showLandmarks) {
      for (const lm of curLandmarks) {
        const style = LANDMARK_STYLE[lm.type];
        if (!style) continue; // 未知類型:跟 GUI 一樣略過,不畫
        const icon = L.icon({
          iconUrl: style.icon,
          iconSize: [style.size, style.size],
          iconAnchor: [style.size / 2, style.size / 2],
          className: 'pmap2-landmark',
        });
        const name = pickLocalizedName(lm.name, lang);
        const typeLabel = lm.type === 'Tower' ? d.tower : lm.type === 'Dungeon' ? d.dungeon : d.fastTravel;
        L.marker([lm.y, lm.x], { icon })
          .bindTooltip(
            `<div style="font-weight:800">${escapeHtml(name)}</div>` +
              `<div>${escapeHtml(typeLabel)}${lm.lv ? ` · Lv.${lm.lv}` : ''}</div>`,
            { direction: 'top', className: 'pmap2-tooltip' },
          )
          .addTo(group);
      }
    }

    // 頭目:依 kind 分野外頭目(Alpha Pal,紅框皇冠)與封印領域(Sealed Realm,紫框傳送門),
    // 對齊 GUI 的 pmap-boss 系列;舊資料沒有 kind 一律當野外頭目(field)處理。
    if (showBosses) {
      for (const b of curBosses) {
        const iconUrl = b.icon ? palAvatarUrl(b.icon) : null;
        const kind = b.kind ?? 'field';
        const icon = bossMarkerIcon(iconUrl, b.lv, kind);
        const name = pickLocalizedName(b.name, lang);
        const kindLabel = kind === 'sealed' ? d.sealedRealm : d.alphaPal;
        L.marker([b.y, b.x], { icon, riseOnHover: true })
          .bindTooltip(
            `<div style="font-weight:800">${escapeHtml(name)}</div>` +
              `<div>${escapeHtml(kindLabel)}${b.lv ? ` · Lv.${b.lv}` : ''}</div>`,
            { direction: 'top', className: 'pmap2-tooltip' },
          )
          .addTo(group);
      }
    }

    // 公會據點:Palbox 圖示 + 公會配色圓角方框,對齊 GUI 的 pmap-base。配色優先用
    // agent 算好的 c(guildColorFromId,跟 GUI 完全同演算法);舊快照沒有 c 時退回
    // 「依公會名雜湊」的舊版配色(僅供沒有 c 欄位的過渡期快照使用)。
    if (showBases) {
      for (const b of snapshot.bases ?? []) {
        if (!inWorld(b.m)) continue;
        const color = b.c ?? (b.g ? hashColor(b.g) : '#9aa3b5');
        const icon = baseMarkerIcon(color);
        const marker = L.marker([b.y, b.x], { icon });
        if (showGuildNames && b.g) {
          marker.bindTooltip(`<div style="font-weight:800">${escapeHtml(b.g)}</div><div>${escapeHtml(d.bases)}</div>`, {
            direction: 'top',
            className: 'pmap2-tooltip',
          });
        } else {
          marker.bindTooltip(`<div>${escapeHtml(d.bases)}</div>`, { direction: 'top', className: 'pmap2-tooltip' });
        }
        marker.addTo(group);
      }
    }

    if (showOffline) {
      for (const p of snapshot.offline ?? []) {
        if (!inWorld(p.m)) continue;
        addPlayerDot(group, p, { offline: true, showNames, lang, d });
      }
    }

    if (showPlayers) {
      for (const p of snapshot.players ?? []) {
        if (!inWorld(p.m)) continue;
        addPlayerDot(group, p, { offline: false, showNames, lang, d });
      }
    }
  }, [
    world,
    snapshot,
    landmarks,
    treeLandmarks,
    bosses,
    treeBosses,
    showPlayers,
    showOffline,
    showBases,
    showLandmarks,
    showBosses,
    showNames,
    showGuildNames,
    lang,
    d,
  ]);

  return <div ref={containerRef} className="map2-canvas" />;
}

// 玩家徽章:對齊 GUI 的 pmap-avatar —— 有 icon(agent 算好的隨機帕魯頭像)就用圖,
// 沒有就退回首字母徽章(viewer 既有的 fallback 設計,見 markerIcon.ts 的說明)。線上白框、
// 離線灰框 + 變暗,偷襲警告紅色脈動 halo,皆對齊 GUI 的 .pmap-avatar 系列樣式。

function addPlayerDot(
  group: L.LayerGroup,
  p: { n: string; lv: number; x: number; y: number; icon?: string; warn?: boolean },
  opts: { offline: boolean; showNames: boolean; lang: MapLang; d: ReturnType<typeof getMapDict> },
) {
  const { offline, showNames, d } = opts;
  const name = p.n || '—';
  const iconUrl = p.icon ? palAvatarUrl(p.icon) : null;
  const labelHtml = showNames ? nameLabelHtml(escapeHtml(name), PLAYER_AVATAR_SIZE, { offline }) : '';
  const icon = playerAvatarIcon({
    iconUrl,
    name,
    ring: offline ? '#8a94a3' : '#ffffff',
    offline,
    raid: !offline && !!p.warn,
    labelHtml,
  });
  const marker = L.marker([p.y, p.x], { icon, riseOnHover: true });
  marker.bindTooltip(
    `<div style="font-weight:800">${escapeHtml(name)}</div>` +
      `<div>${d.lv}${p.lv}${offline ? ` · ${escapeHtml(d.lastSeenAt)}` : ''}</div>` +
      (p.warn ? `<div style="color:#e05b5b;font-weight:700">${escapeHtml(d.raidWarning)}</div>` : ''),
    { direction: 'top', className: 'pmap2-tooltip' },
  );
  marker.addTo(group);
}
