// 公開地圖快照的資料形狀(agent 每 60 秒推到 Cloudflare Worker,這裡是唯讀 viewer)。
// 座標系:x/y 已經是「地圖座標」(agent 端算好的,不是存檔原始世界座標),m 決定要對到
// 哪張底圖 —— "world" 對主世界底圖,"tree" 對世界樹底圖。兩張底圖各自的邊界常數
// 抄自 packages/web/src/MapTab.tsx(IMAGE_BOUNDS / TREE_IMAGE_BOUNDS)。

export type SnapshotWorld = 'world' | 'tree';

export interface SnapshotEntity {
  /** 顯示名 */
  n: string;
  lv: number;
  x: number;
  y: number;
  /** 缺省視為 "world"(主世界)。 */
  m?: SnapshotWorld;
  /** 頭像圖示裸檔名(game-data/pals/ 內的檔名),agent 用跟 GUI PlayerAvatar 相同的雜湊
   *  演算法依 userId 挑好;沒有就退回首字母徽章。實際檔案由 copy-map-assets.mjs 複製到
   *  /map-assets/pal-avatars/,URL 組法見 LeafletMap.tsx 的 palAvatarUrl()。 */
  icon?: string;
  /** 偷襲警告:站在「非自己公會」據點附近。只有 agent 端 showPlayers 與 showBases 都開啟
   *  時才會出現;離線玩家不會有這個欄位。 */
  warn?: boolean;
}

export interface SnapshotBase {
  x: number;
  y: number;
  m?: SnapshotWorld;
  /** 公會名,可能省略。 */
  g?: string;
  /** 公會配色(HSL 字串),agent 用跟 GUI guildColor 相同的演算法(依 guildId)算好;
   *  showGuildNames 關閉時仍可能有值(顏色本身不洩漏名稱)。沒有值時 viewer 退回依公會名
   *  雜湊出的顏色(對齊舊快照 / 沒有 guildId 的情境)。 */
  c?: string;
}

export interface MapSnapshotV1 {
  v: 1;
  name: string;
  generatedAt: number;
  onlineCount: number;
  maxPlayers?: number;
  show: {
    players?: boolean;
    names?: boolean;
    offline?: boolean;
    bases?: boolean;
    guildNames?: boolean;
  };
  /** 關掉的圖層,這個 key 可能整個不存在。 */
  players?: SnapshotEntity[];
  offline?: SnapshotEntity[];
  bases?: SnapshotBase[];
}

export interface SnapshotApiResponse {
  updatedAt: number;
  snapshot: MapSnapshotV1 | null;
}

/** 靜態地標(Fast Travel / Tower / Dungeon):抄自 packages/web/src/MapTab.tsx 的
 * Landmark 形狀。type 集合以 GUI 的 LANDMARK_STYLE 為準(見 markerIcon.ts)。 */
export interface StaticLandmark {
  type: string;
  name: { en: string; zh: string; 'zh-CN'?: string; zhCN?: string; ja: string };
  x: number;
  y: number;
  lv?: number;
}

/** 頭目:抄自 packages/web/src/MapTab.tsx 的 Boss 形狀,資料來源
 * game-data/bosses.json / worldtree-bosses.json(scripts/copy-map-assets.mjs 同步)。
 * 依 kind 區分野外頭目(Alpha Pal)與封印領域(Sealed Realm),對齊 palworld.gg 的分類。 */
export interface StaticBoss {
  name: { en: string; zh: string; 'zh-CN'?: string; zhCN?: string; ja: string };
  x: number;
  y: number;
  lv?: number;
  /** 帕魯圖鑑頭像裸檔名(game-data/pals/ 內),沒有就不畫圖只留框。 */
  icon?: string;
  /** 'field' = 野外頭目(Alpha Pal,紅框皇冠);'sealed' = 封印領域(紫框傳送門)。
   * 選填,舊資料(沒有這個欄位)一律當 'field' 處理。 */
  kind?: 'field' | 'sealed';
}

export type MapWorld = 'main' | 'tree';
