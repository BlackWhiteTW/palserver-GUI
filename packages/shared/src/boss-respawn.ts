/**
 * 頭目重生時間(贊助者先行版 boss-respawn):純伺服器端 UE4SS Lua 模組
 * (PalserverBossReporter)每 15 秒輪詢頭目 spawner,把死活與時間戳寫到
 * Pal/Saved/palserver-boss-state.json;agent 讀檔、web 與 bosses.json 的
 * 全頭目清單做左外連接顯示。這裡放 agent ↔ web 共用型別與純函式(可單元測試)。
 *
 * 座標:模組回報的是 Unreal 世界座標,與 bosses.json 的地圖座標(±1000)配對前
 * 需先經 savToMap / savToWorldTreeMap 轉換(見 bossStateMapCoord)。
 */
import {
  isWorldTreeCoord,
  savToMap,
  savToWorldTreeMap,
  type PublicMapArea,
  type PublicMapBossPoint,
} from "./index.js";

export const BOSS_REPORTER_MOD_NAME = "PalserverBossReporter";
/** 狀態檔相對遊戲安裝根的路徑(模組寫、agent 讀)。 */
export const BOSS_STATE_REL = "Pal/Saved/palserver-boss-state.json";
/** 官方預設野外頭目重生冷卻(秒);沒有實測值時用它算倒數。 */
export const DEFAULT_BOSS_RESPAWN_SECONDS = 3600;
/** state 距今超過這個秒數視為過時(模組每 15s 寫一次,寬限到 60s)。 */
export const BOSS_STATE_STALE_SECONDS = 60;
/** 世界座標轉地圖座標後,與 bosses.json 頭目配對的最大距離(地圖單位;吸收 mapdata 與
 *  實際 spawner 座標的偏差)。註:野外頭目地圖座標實測約 x∈[-1700,910]、y∈[-1980,840]。 */
export const BOSS_MATCH_MAP_RADIUS = 60;
/** 地下城入口座標轉地圖座標後,與 bosses.json 頭目(地城頭目也在其中,同座標)配對的最大距離。
 *  地城位置固定、偏差小(實測 0~1),用較緊的半徑。 */
export const DUNGEON_MATCH_MAP_RADIUS = 40;

/** 模組寫到 state 檔的一筆 spawner 狀態。 */
export interface BossStateEntry {
  /** spawner 名稱(如 81_1_grass_FBOSS_4);非帕魯名,對應地圖頭目靠座標。 */
  name: string;
  /** true=存活;false=已擊殺;null=無法判定(該區未載入 / 附近無玩家)。 */
  alive: boolean | null;
  /** 最近一次「活→死」的 epoch 秒;-1=未觀測到。 */
  diedAt: number;
  /** 最近一次「死→活」的 epoch 秒;-1=未觀測到。 */
  respawnedAt: number;
  /** 觀測到的實測重生冷卻(死→活的間隔,秒);-1=尚無完整一輪觀測。 */
  respawnInterval: number;
  /** spawner 的 Unreal 世界座標。 */
  x: number;
  y: number;
  z: number;
}

/** 地下城頭目(來自 UE4SS 讀 PalDungeonInstanceModelFixedDungeon 的執行期狀態)。
 *  與野外頭目不同:有遊戲內建的精準重生時間、名稱、且是伺服器端資料(不需玩家貼著)。 */
export interface DungeonBossEntry {
  /** 地城名稱(遊戲回傳的當前語言文字,如「冰鳥密域」)。 */
  name: string;
  /** 地城等級。 */
  level: number;
  /** 0=存活(Spawned)、1=已擊殺(Dead,等重生)。 */
  bossState: number;
  /** 已擊殺時的重生 epoch 秒(模組寫檔當下 now + 遊戲自算剩餘秒);存活時 -1。 */
  respawnAt: number;
  /** 地城入口世界座標(RepFieldWarpPointLocation);用 bossStateMapCoord 同款轉地圖座標。 */
  x: number;
  y: number;
  z: number;
}

/** 模組輸出的整份狀態檔。 */
export interface BossRespawnState {
  version: number;
  /** 產生時間 epoch 秒(過時判斷用)。 */
  generatedAt: number;
  tick: number;
  spawnerTotal: number;
  bossCount: number;
  aliveCount: number;
  bosses: BossStateEntry[];
  /** 地下城頭目(模組 v1.2+;舊模組沒有此欄位)。 */
  dungeons?: DungeonBossEntry[];
}

/** agent → web:頭目重生功能的整體狀態。 */
export interface BossRespawnStatus {
  /** false 時 reason 說明(非 Windows native / 伺服器未安裝完成)。 */
  supported: boolean;
  reason?: string;
  /** Lua 模組所需的 UE4SS 是否在位。 */
  ue4ss: boolean;
  /** 我們的 PalserverBossReporter Lua 模組是否已安裝。 */
  modInstalled: boolean;
  /** 我們安裝時記錄的模組版本;未安裝時為 null。 */
  version?: string | null;
  /** 模組寫出的最新狀態;尚無檔案(未啟動過)時為 null。 */
  state: BossRespawnState | null;
  /** state 是否過時(generatedAt 距今超過 BOSS_STATE_STALE_SECONDS)。 */
  stale?: boolean;
}

/** spawner 世界座標 → 地圖座標(自動分流主世界 / 世界樹)。 */
export function bossStateMapCoord(entry: Pick<BossStateEntry, "x" | "y">): { x: number; y: number } {
  return isWorldTreeCoord(entry.x) ? savToWorldTreeMap(entry.x, entry.y) : savToMap(entry.x, entry.y);
}

/**
 * 在模組回報的 spawner 中,找出離地圖座標 (mapX,mapY) 最近且在半徑內的一筆。
 * 找不到回 null。注意:單獨對每隻頭目呼叫這個會有「鄰近頭目共用同一 spawner」的誤配
 * 問題(bosses.json 有多對頭目間距 < 半徑),需要一對一指派時請用 assignReportedBosses。
 */
export function matchReportedBoss(
  mapX: number,
  mapY: number,
  reported: readonly BossStateEntry[],
  radius = BOSS_MATCH_MAP_RADIUS,
): BossStateEntry | null {
  let best: BossStateEntry | null = null;
  let bestD = radius;
  for (const e of reported) {
    const m = bossStateMapCoord(e);
    const d = Math.hypot(m.x - mapX, m.y - mapY);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * 一對一最近指派:把每個回報的 spawner 指給地圖座標最近、且在半徑內的頭目;最近的配對
 * 優先成立,配到的頭目與 spawner 都移出候選。避免鄰近頭目(bosses.json 有多對間距 < 半徑,
 * 如 Lyleen 與 Lyleen Noct 僅約 4.5 單位)共用同一 spawner,或把「所在區域未載入」的頭目
 * 誤標成鄰居的死活/倒數。呼叫端須先依世界(主世界 / 世界樹)分池後分別呼叫。
 * 回傳 Map<頭目物件, 指派到的 spawner>;沒配到的頭目不在 Map 內(= 狀態未知)。
 */
export function assignReportedBosses<T extends { x: number; y: number }>(
  bosses: readonly T[],
  reported: readonly BossStateEntry[],
  radius = BOSS_MATCH_MAP_RADIUS,
): Map<T, BossStateEntry> {
  const pairs: { boss: T; entry: BossStateEntry; d: number }[] = [];
  for (const entry of reported) {
    const m = bossStateMapCoord(entry);
    for (const boss of bosses) {
      const d = Math.hypot(m.x - boss.x, m.y - boss.y);
      if (d <= radius) pairs.push({ boss, entry, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const out = new Map<T, BossStateEntry>();
  const usedEntry = new Set<BossStateEntry>();
  for (const p of pairs) {
    if (out.has(p.boss) || usedEntry.has(p.entry)) continue;
    out.set(p.boss, p.entry);
    usedEntry.add(p.entry);
  }
  return out;
}

export type BossLiveStatus = "alive" | "dead" | "unknown";

/** 由一筆 spawner 狀態算出的顯示資訊(死活 + 重生倒數)。 */
export interface BossRespawnInfo {
  status: BossLiveStatus;
  /** 已擊殺時間 epoch 秒(dead 且有觀測到擊殺時間時);否則 null。 */
  diedAt: number | null;
  /** 預估重生時間 epoch 秒(dead 且有 diedAt 時);否則 null。 */
  respawnAt: number | null;
  /** 距離重生的秒數(可為負 = 早該重生了);null = 無倒數可算。 */
  secondsLeft: number | null;
  /** 這筆倒數是否採用實測重生間隔(false = 用預設 3600s)。 */
  measured: boolean;
}

/**
 * 由一筆 spawner 狀態(null = 未配對到)算出顯示用的死活與重生倒數。
 * 重生間隔優先用模組實測到的 respawnInterval,沒有才退回 DEFAULT_BOSS_RESPAWN_SECONDS。
 */
export function bossRespawnInfo(entry: BossStateEntry | null, nowSec: number): BossRespawnInfo {
  const none: BossRespawnInfo = {
    status: "unknown",
    diedAt: null,
    respawnAt: null,
    secondsLeft: null,
    measured: false,
  };
  if (!entry) return none;
  if (entry.alive === true) return { ...none, status: "alive" };
  // 「目前已擊殺、尚未重生」用擊殺歷史判定,不看當前 alive:有記錄到擊殺時間(diedAt),
  // 且該次擊殺晚於最近一次重生(respawnedAt)。這樣頭目遺體被清(alive 變 null)或玩家暫時
  // 離開該區時,倒數仍持續顯示。只有「觀測到 活→死 轉變」的模組才會記 diedAt,所以
  // alive=false/null 但沒 diedAt 的(活著卻沒玩家在旁、或沒目擊擊殺)一律維持「未知」。
  const diedAt = entry.diedAt > 0 ? entry.diedAt : null;
  const lastRespawn = entry.respawnedAt > 0 ? entry.respawnedAt : -1;
  if (diedAt !== null && diedAt > lastRespawn) {
    const measured = entry.respawnInterval > 0;
    const interval = measured ? entry.respawnInterval : DEFAULT_BOSS_RESPAWN_SECONDS;
    const respawnAt = diedAt + interval;
    return { status: "dead", diedAt, respawnAt, secondsLeft: respawnAt - nowSec, measured };
  }
  return none;
}

export interface DungeonBossInfo {
  status: "alive" | "dead";
  /** 重生 epoch 秒(dead 時);否則 null。 */
  respawnAt: number | null;
  /** 距離重生的秒數(可為負=早該重生);null=存活。 */
  secondsLeft: number | null;
}

/** 地城頭目顯示資訊:BossState==1 且有重生時間 → 已擊殺+倒數;否則存活。
 *  地城重生時間是遊戲內建的(CalcRemainSecondsBy),精準,不像野外頭目要估算。 */
export function dungeonBossInfo(entry: DungeonBossEntry, nowSec: number): DungeonBossInfo {
  if (entry.bossState === 1 && entry.respawnAt > 0) {
    return { status: "dead", respawnAt: entry.respawnAt, secondsLeft: entry.respawnAt - nowSec };
  }
  return { status: "alive", respawnAt: null, secondsLeft: null };
}

/** state 是否過時(模組停了或伺服器沒在跑,回報不再更新)。 */
export function isBossStateStale(
  state: Pick<BossRespawnState, "generatedAt"> | null,
  nowSec: number,
  maxAgeSec = BOSS_STATE_STALE_SECONDS,
): boolean {
  if (!state) return false;
  return nowSec - state.generatedAt > maxAgeSec;
}

/** 公開地圖用:野外/封印頭目 catalog 條目(配對只需地圖座標)。 */
export type PublicBossCatalogEntry = { x: number; y: number };

/**
 * 由模組回報的執行期狀態 + 主世界/世界樹兩份頭目 catalog(= bosses.json 的地圖座標,野外/封印/
 * 地城頭目都在其中),產出公開地圖快照要用的頭目狀態點。在 agent 端執行(agent 是 @palserver/shared
 * 成員,可直接用這些純函式),讓雲端 viewer 只需「按座標疊狀態」,不必自帶配對邏輯(viewer 非 workspace 成員)。
 *
 * 兩種重生來源都疊到同一份 catalog 頭目 marker 上(bosses.json 的 18 隻地城頭目與野外頭目同座標):
 * - 野外/封印(state.bosses):依世界分池 → assignReportedBosses 一對一 → bossRespawnInfo(unknown 略)。
 * - 地下城(state.dungeons):bossStateMapCoord 近鄰配 catalog → dungeonBossInfo(精準時間,ms=true 不標估算 *)。
 * 點座標用 catalog 的地圖座標(與 viewer 自帶 bosses.json 同源,可精確 `${x},${y}` 配對)。
 * 同一座標若野外已產點就不再被地城覆蓋(理論上不同座標,防呆)。
 *
 * state 為 null(未安裝模組 / 尚無回報)→ 回空陣列,快照就不帶 bosses 欄位、viewer 開關不出現。
 */
export function buildPublicMapBossPoints(
  state: BossRespawnState | null,
  catalogs: { field: readonly PublicBossCatalogEntry[]; tree: readonly PublicBossCatalogEntry[] },
  nowSec: number,
): PublicMapBossPoint[] {
  const bosses: PublicMapBossPoint[] = [];
  if (!state) return bosses;

  const seen = new Set<string>();
  // 野外/封印頭目:依世界分池後各自一對一指派。
  const reported = state.bosses ?? [];
  const worlds: { catalog: readonly PublicBossCatalogEntry[]; pool: BossStateEntry[]; m: PublicMapArea }[] = [
    { catalog: catalogs.field, pool: reported.filter((e) => !isWorldTreeCoord(e.x)), m: "world" },
    { catalog: catalogs.tree, pool: reported.filter((e) => isWorldTreeCoord(e.x)), m: "tree" },
  ];
  for (const w of worlds) {
    const assign = assignReportedBosses(w.catalog, w.pool);
    for (const [cat, entry] of assign) {
      const info = bossRespawnInfo(entry, nowSec);
      if (info.status === "unknown") continue;
      const point: PublicMapBossPoint = { x: cat.x, y: cat.y, m: w.m, st: info.status };
      if (info.status === "dead" && info.respawnAt != null) {
        point.ra = info.respawnAt;
        point.ms = info.measured;
      }
      bosses.push(point);
      seen.add(`world:${cat.x},${cat.y}`);
    }
  }

  // 地下城頭目:reported 是世界座標,轉地圖座標後近鄰配主世界 catalog(地城頭目也在 bosses.json 內、同座標)。
  for (const entry of state.dungeons ?? []) {
    const mc = bossStateMapCoord(entry);
    let best: PublicBossCatalogEntry | null = null;
    let bestD = DUNGEON_MATCH_MAP_RADIUS;
    for (const cat of catalogs.field) {
      const d = Math.hypot(cat.x - mc.x, cat.y - mc.y);
      if (d <= bestD) {
        bestD = d;
        best = cat;
      }
    }
    if (!best || seen.has(`world:${best.x},${best.y}`)) continue;
    const info = dungeonBossInfo(entry, nowSec);
    const point: PublicMapBossPoint = { x: best.x, y: best.y, m: "world", st: info.status };
    if (info.status === "dead" && info.respawnAt != null) {
      point.ra = info.respawnAt;
      point.ms = true; // 地城重生時間是遊戲內建、精準,不標估算 *
    }
    bosses.push(point);
    seen.add(`world:${best.x},${best.y}`);
  }

  return bosses;
}
