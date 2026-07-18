// /map viewer 專用的輕量 i18n:這個路由在 [lang] 之外,不接站上的 i18n/dictionaries.ts
// 體系,靠 navigator.language 自己選 zh/en/ja 三語小字典就夠。

export type MapLang = 'zh' | 'zh-CN' | 'en' | 'ja';

/** 判斷一個 BCP-47 標記是不是簡體中文(zh-CN / zh-Hans / zh-SG …)。 */
function isSimplifiedZh(l: string): boolean {
  return l.startsWith('zh') && (l.includes('cn') || l.includes('hans') || l.includes('sg') || l.includes('my'));
}

export function pickMapLang(): MapLang {
  if (typeof navigator === 'undefined') return 'zh';
  const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'zh'];
  for (const raw of prefs) {
    const l = String(raw).toLowerCase();
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('en')) return 'en';
    if (isSimplifiedZh(l)) return 'zh-CN';
    if (l.startsWith('zh')) return 'zh';
  }
  return 'zh';
}

export interface MapDict {
  loading: string;
  missingIdTitle: string;
  missingIdBody: string;
  notFoundTitle: string;
  notFoundBody: string;
  fetchErrorTitle: string;
  fetchErrorBody: string;
  offlineBanner: string;
  updatedJustNow: string;
  updatedSecondsAgo: (n: number) => string;
  updatedMinutesAgo: (n: number) => string;
  online: (n: number, max?: number) => string;
  players: string;
  offlinePlayers: string;
  bases: string;
  landmarks: string;
  mainWorld: string;
  worldTree: string;
  lv: string;
  lastSeenAt: string;
  fastTravel: string;
  tower: string;
  dungeon: string;
  /** 頭目圖層 toggle 標籤(同時涵蓋野外頭目 + 封印領域兩種 kind)。 */
  boss: string;
  /** 頭目 tooltip 用:kind === 'field' 時顯示。 */
  alphaPal: string;
  /** 頭目 tooltip 用:kind === 'sealed' 時顯示。 */
  sealedRealm: string;
  raidWarning: string;
  noPlayers: string;
  poweredBy: string;
  // 品牌頂欄用(對齊官網 nav 的 d.github/d.download,見 i18n/dictionaries.ts 的 nav 區塊)
  github: string;
  download: string;
}

const dict: Record<MapLang, MapDict> = {
  zh: {
    loading: '載入中…',
    missingIdTitle: '缺少地圖連結參數',
    missingIdBody: '這個網址少了 ?s= 分享代碼,請跟伺服器管理員確認完整連結。',
    notFoundTitle: '連結不存在或已被撤銷',
    notFoundBody: '這個地圖分享連結可能已經失效,或伺服器管理員已關閉公開分享。',
    fetchErrorTitle: '暫時連不上地圖伺服器',
    fetchErrorBody: '請稍後再試,或跟伺服器管理員確認狀態。',
    offlineBanner: '伺服器可能已離線(超過 5 分鐘沒有更新)',
    updatedJustNow: '剛剛更新',
    updatedSecondsAgo: (n) => `更新於 ${n} 秒前`,
    updatedMinutesAgo: (n) => `更新於 ${n} 分鐘前`,
    online: (n, max) => (max != null ? `在線 ${n} / ${max}` : `在線 ${n}`),
    players: '玩家',
    offlinePlayers: '離線玩家',
    bases: '公會據點',
    landmarks: '地標',
    mainWorld: '主世界',
    worldTree: '世界樹',
    lv: 'Lv.',
    lastSeenAt: '最後位置',
    fastTravel: '快速旅行',
    tower: '頭目塔',
    dungeon: '地牢',
    boss: '頭目',
    alphaPal: '阿爾法',
    sealedRealm: '封印領域',
    raidWarning: '靠近他人據點',
    noPlayers: '目前沒有玩家在線上',
    poweredBy: 'palserver GUI 公開地圖',
    github: 'GitHub',
    download: '下載',
  },
  'zh-CN': {
    loading: '加载中…',
    missingIdTitle: '缺少地图链接参数',
    missingIdBody: '这个网址少了 ?s= 分享代码,请跟服务器管理员确认完整链接。',
    notFoundTitle: '链接不存在或已被撤销',
    notFoundBody: '这个地图分享链接可能已经失效,或服务器管理员已关闭公开分享。',
    fetchErrorTitle: '暂时连不上地图服务器',
    fetchErrorBody: '请稍后再试,或跟服务器管理员确认状态。',
    offlineBanner: '服务器可能已离线(超过 5 分钟没有更新)',
    updatedJustNow: '刚刚更新',
    updatedSecondsAgo: (n) => `更新于 ${n} 秒前`,
    updatedMinutesAgo: (n) => `更新于 ${n} 分钟前`,
    online: (n, max) => (max != null ? `在线 ${n} / ${max}` : `在线 ${n}`),
    players: '玩家',
    offlinePlayers: '离线玩家',
    bases: '公会据点',
    landmarks: '地标',
    mainWorld: '主世界',
    worldTree: '世界树',
    lv: 'Lv.',
    lastSeenAt: '最后位置',
    fastTravel: '快速旅行',
    tower: '头目塔',
    dungeon: '地牢',
    boss: '头目',
    alphaPal: '阿尔法',
    sealedRealm: '封印领域',
    raidWarning: '靠近他人据点',
    noPlayers: '目前没有玩家在线上',
    poweredBy: 'palserver GUI 公开地图',
    github: 'GitHub',
    download: '下载',
  },
  en: {
    loading: 'Loading…',
    missingIdTitle: 'Missing map link parameter',
    missingIdBody: 'This URL is missing the ?s= share code — check the full link with your server admin.',
    notFoundTitle: 'Link not found or revoked',
    notFoundBody: 'This map share link may have expired, or the admin turned off public sharing.',
    fetchErrorTitle: "Can't reach the map server right now",
    fetchErrorBody: 'Please try again shortly, or check with your server admin.',
    offlineBanner: 'Server may be offline (no update for over 5 minutes)',
    updatedJustNow: 'Updated just now',
    updatedSecondsAgo: (n) => `Updated ${n}s ago`,
    updatedMinutesAgo: (n) => `Updated ${n}m ago`,
    online: (n, max) => (max != null ? `Online ${n} / ${max}` : `Online ${n}`),
    players: 'Players',
    offlinePlayers: 'Offline players',
    bases: 'Guild bases',
    landmarks: 'Landmarks',
    mainWorld: 'Main World',
    worldTree: 'World Tree',
    lv: 'Lv.',
    lastSeenAt: 'Last seen',
    fastTravel: 'Fast Travel',
    tower: 'Tower',
    dungeon: 'Dungeon',
    boss: 'Boss',
    alphaPal: 'Alpha Pal',
    sealedRealm: 'Sealed Realm',
    raidWarning: "Near another guild's base",
    noPlayers: 'No players online right now',
    poweredBy: 'Public map by palserver GUI',
    github: 'GitHub',
    download: 'Download',
  },
  ja: {
    loading: '読み込み中…',
    missingIdTitle: '地図リンクのパラメータがありません',
    missingIdBody: 'この URL には ?s= 共有コードがありません。管理者に完全なリンクを確認してください。',
    notFoundTitle: 'リンクが存在しないか取り消されました',
    notFoundBody: 'この地図共有リンクは無効になったか、管理者が公開共有をオフにした可能性があります。',
    fetchErrorTitle: '地図サーバーに接続できません',
    fetchErrorBody: 'しばらくしてから再試行するか、管理者に状態を確認してください。',
    offlineBanner: 'サーバーがオフラインの可能性があります(5分以上更新なし)',
    updatedJustNow: 'たった今更新',
    updatedSecondsAgo: (n) => `${n}秒前に更新`,
    updatedMinutesAgo: (n) => `${n}分前に更新`,
    online: (n, max) => (max != null ? `オンライン ${n} / ${max}` : `オンライン ${n}`),
    players: 'プレイヤー',
    offlinePlayers: 'オフラインプレイヤー',
    bases: 'ギルド拠点',
    landmarks: 'ランドマーク',
    mainWorld: 'メインワールド',
    worldTree: '世界樹',
    lv: 'Lv.',
    lastSeenAt: '最終位置',
    fastTravel: '高速移動',
    tower: 'タワー',
    dungeon: 'ダンジョン',
    boss: 'ボス',
    alphaPal: 'アルファパル',
    sealedRealm: '封印領域',
    raidWarning: '他ギルドの拠点に接近',
    noPlayers: '現在オンラインのプレイヤーはいません',
    poweredBy: 'palserver GUI 公開マップ',
    github: 'GitHub',
    download: 'ダウンロード',
  },
};

export function getMapDict(lang: MapLang): MapDict {
  return dict[lang];
}

// ── 品牌頂欄共用:官網導流連結 + viewer 語言的 localStorage 記憶 ──
// (原本各自散在 MapPageClient.tsx,搬來這裡讓 MapNav.tsx 也能共用,不必重複定義。)

/** viewer 四語對齊官網 i18n/config.ts 的 locales(zh / zh-CN / en / ja),順序也一致。 */
export const MAP_LOCALES: MapLang[] = ['zh', 'zh-CN', 'en', 'ja'];

/** 語言切換器顯示的名稱,對齊官網 i18n/config.ts 的 localeName。 */
export const mapLocaleName: Record<MapLang, string> = {
  zh: '繁體中文',
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
};

/** marker 名稱(地標/頭目)依 viewer 語言挑一個:簡體優先 zh-CN→zhCN→繁中→英文,
 * 其餘語言直接取對應鍵、缺就退回英文。資料來源(paldb)不一定每筆都有各語系名。 */
export function pickLocalizedName(
  name: { en?: string; zh?: string; 'zh-CN'?: string; zhCN?: string; ja?: string },
  lang: MapLang,
): string {
  if (lang === 'zh-CN') return name['zh-CN'] || name.zhCN || name.zh || name.en || '';
  return name[lang] || name.en || '';
}

const SITE_URL = 'https://palserver-gui.iosoftware.ai';

/** 官網品牌延伸:頁首/頁尾/狀態頁的「回官網」連結都指到對應語系首頁,帶 utm 方便
 * 日後統計這個公開地圖幫官網導流多少。 */
export function brandHref(lang: MapLang): string {
  return `${SITE_URL}/${lang}/?utm_source=public-map`;
}

const MAP_LANG_STORAGE_KEY = 'palserver.mapLang';

/** 讀使用者上次手動選過的 viewer 顯示語言;沒選過或 localStorage 不可用就回 null,
 * 呼叫端 fallback 到 pickMapLang()。 */
export function readStoredMapLang(): MapLang | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(MAP_LANG_STORAGE_KEY);
    if (v === 'zh' || v === 'zh-CN' || v === 'en' || v === 'ja') return v;
  } catch {
    // 隱私模式/儲存被封鎖:當作沒記住,不影響當前 session 顯示
  }
  return null;
}

/** 記住使用者手動選的 viewer 顯示語言,下次進來 MapPageClient 直接套用。 */
export function storeMapLang(lang: MapLang): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MAP_LANG_STORAGE_KEY, lang);
  } catch {
    // 忽略寫入失敗,純粹是「記住」這個加分功能,不影響當前 session
  }
}
