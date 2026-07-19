import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bossRespawnInfo,
  bossStateMapCoord,
  isBossStateStale,
  matchReportedBoss,
  assignReportedBosses,
  dungeonBossInfo,
  buildPublicMapBossPoints,
  DEFAULT_BOSS_RESPAWN_SECONDS,
  BOSS_MATCH_MAP_RADIUS,
  type BossStateEntry,
  type DungeonBossEntry,
  type BossRespawnState,
} from "./index.js";
import { savToMap, savToWorldTreeMap, isWorldTreeCoord } from "./index.js";

function entry(patch: Partial<BossStateEntry>): BossStateEntry {
  return {
    name: "81_1_grass_FBOSS_4",
    alive: false,
    diedAt: -1,
    respawnedAt: -1,
    respawnInterval: -1,
    x: 0,
    y: 0,
    z: 0,
    ...patch,
  };
}

test("bossRespawnInfo:未配對 / alive=null → unknown,無倒數", () => {
  assert.equal(bossRespawnInfo(null, 1000).status, "unknown");
  assert.equal(bossRespawnInfo(entry({ alive: null }), 1000).status, "unknown");
  assert.equal(bossRespawnInfo(null, 1000).secondsLeft, null);
});

test("bossRespawnInfo:alive=true → alive,無倒數", () => {
  const r = bossRespawnInfo(entry({ alive: true }), 1000);
  assert.equal(r.status, "alive");
  assert.equal(r.secondsLeft, null);
});

test("bossRespawnInfo:已擊殺 + 有 diedAt,無實測 → 用預設 3600s 倒數", () => {
  const died = 1000;
  const now = died + 600; // 死後 10 分鐘
  const r = bossRespawnInfo(entry({ alive: false, diedAt: died }), now);
  assert.equal(r.status, "dead");
  assert.equal(r.measured, false);
  assert.equal(r.diedAt, died);
  assert.equal(r.respawnAt, died + DEFAULT_BOSS_RESPAWN_SECONDS);
  assert.equal(r.secondsLeft, DEFAULT_BOSS_RESPAWN_SECONDS - 600);
});

test("bossRespawnInfo:有實測 respawnInterval → 優先採用,measured=true", () => {
  const died = 5000;
  const measured = 1800; // 實測 30 分鐘重生
  const r = bossRespawnInfo(entry({ alive: false, diedAt: died, respawnInterval: measured }), died + 100);
  assert.equal(r.measured, true);
  assert.equal(r.respawnAt, died + measured);
  assert.equal(r.secondsLeft, measured - 100);
});

test("bossRespawnInfo:alive=false 但沒觀測到擊殺(diedAt<=0)→ unknown,不可武斷判已擊殺", () => {
  // 這是「活著但附近沒玩家、頭目未實例化」與「真被殺但沒目擊」無法區分的曖昧狀態,
  // 一律當未知,不能顯示「已擊殺」。
  const r = bossRespawnInfo(entry({ alive: false, diedAt: -1 }), 1000);
  assert.equal(r.status, "unknown");
  assert.equal(r.secondsLeft, null);
  assert.equal(r.respawnAt, null);
});

test("bossRespawnInfo:倒數過期為負值(早該重生但模組尚未觀測到)", () => {
  const died = 1000;
  const r = bossRespawnInfo(entry({ alive: false, diedAt: died }), died + DEFAULT_BOSS_RESPAWN_SECONDS + 120);
  assert.ok(r.secondsLeft !== null && r.secondsLeft < 0);
});

test("bossRespawnInfo:擊殺後遺體被清 alive→null,但 diedAt 已記錄 → 仍顯示已擊殺+倒數", () => {
  // 實機:頭目 HP 歸零記下 diedAt,之後遺體 handle 被清、alive 變 null;倒數要靠 diedAt 續存。
  const died = 1000;
  const r = bossRespawnInfo(entry({ alive: null, diedAt: died }), died + 600);
  assert.equal(r.status, "dead");
  assert.equal(r.respawnAt, died + DEFAULT_BOSS_RESPAWN_SECONDS);
  assert.equal(r.secondsLeft, DEFAULT_BOSS_RESPAWN_SECONDS - 600);
});

test("bossRespawnInfo:死後又重生(respawnedAt 晚於 diedAt)、現在沒人在旁 → 未知,不是已擊殺", () => {
  const r = bossRespawnInfo(entry({ alive: null, diedAt: 1000, respawnedAt: 2000 }), 3000);
  assert.equal(r.status, "unknown");
});

test("bossRespawnInfo:死後又重生、現在觀測到活著 → 活著", () => {
  const r = bossRespawnInfo(entry({ alive: true, diedAt: 1000, respawnedAt: 2000 }), 3000);
  assert.equal(r.status, "alive");
});

test("matchReportedBoss:半徑內取最近,半徑外回 null", () => {
  // 造一個地圖座標 (0,0) 的 spawner:savToMap 反解 → savX=-123888, savY=158000
  const atOrigin = entry({ x: -123888, y: 158000 });
  const m = bossStateMapCoord(atOrigin);
  assert.ok(Math.abs(m.x) < 1e-6 && Math.abs(m.y) < 1e-6, "應轉到地圖原點");

  assert.equal(matchReportedBoss(0, 0, [atOrigin]), atOrigin);
  // 距原點很遠(500,500)> 預設半徑 60 → 找不到
  assert.equal(matchReportedBoss(500, 500, [atOrigin]), null);
});

test("matchReportedBoss:多筆時取最近的那筆", () => {
  // near:世界座標對應地圖約 (0,0);far:明顯偏移
  const near = entry({ name: "near", x: -123888, y: 158000 });
  const far = entry({ name: "far", x: -123888 + 459 * 40, y: 158000 }); // 地圖 y 偏 40
  const hit = matchReportedBoss(0, 0, [far, near], BOSS_MATCH_MAP_RADIUS);
  assert.equal(hit?.name, "near");
});

test("isBossStateStale:新鮮不過時,超過門檻過時", () => {
  const now = 100000;
  assert.equal(isBossStateStale({ generatedAt: now - 10 }, now), false);
  assert.equal(isBossStateStale({ generatedAt: now - 120 }, now), true);
  assert.equal(isBossStateStale(null, now), false);
});

function dungeon(patch: Partial<DungeonBossEntry>): DungeonBossEntry {
  return { name: "冰鳥密域", level: 15, bossState: 0, respawnAt: -1, x: 0, y: 0, z: 0, ...patch };
}

test("dungeonBossInfo:存活(bossState=0)→ alive,無倒數", () => {
  const r = dungeonBossInfo(dungeon({ bossState: 0 }), 1000);
  assert.equal(r.status, "alive");
  assert.equal(r.secondsLeft, null);
  assert.equal(r.respawnAt, null);
});

test("dungeonBossInfo:已擊殺(bossState=1)+ 重生時間 → dead + 精準倒數", () => {
  const r = dungeonBossInfo(dungeon({ level: 60, bossState: 1, respawnAt: 5000 }), 4400);
  assert.equal(r.status, "dead");
  assert.equal(r.respawnAt, 5000);
  assert.equal(r.secondsLeft, 600);
});

test("dungeonBossInfo:bossState=1 但沒重生時間(respawnAt<=0)→ 當存活(不編倒數)", () => {
  const r = dungeonBossInfo(dungeon({ bossState: 1, respawnAt: -1 }), 1000);
  assert.equal(r.status, "alive");
});

test("bossStateMapCoord 與 savToMap 對主世界座標一致", () => {
  const e = entry({ x: -1000, y: 200000 });
  assert.deepEqual(bossStateMapCoord(e), savToMap(-1000, 200000));
});

test("bossStateMapCoord 對世界樹座標走 savToWorldTreeMap 分支", () => {
  // 世界樹頭目 spawner(savX > 350000,取自 worldtree.test.ts 的 Celesdir Noct)
  const treeEntry = entry({ x: 520440, y: -727175 });
  assert.equal(isWorldTreeCoord(520440), true);
  assert.deepEqual(bossStateMapCoord(treeEntry), savToWorldTreeMap(520440, -727175));
});

test("matchReportedBoss:世界樹 spawner 對到自身的世界樹地圖座標", () => {
  const treeSpawner = entry({ name: "tree", x: 520440, y: -727175 });
  const m = bossStateMapCoord(treeSpawner);
  assert.equal(matchReportedBoss(m.x, m.y, [treeSpawner]), treeSpawner);
});

test("assignReportedBosses:一對一,鄰近頭目不共用 spawner(未載入者維持未知)", () => {
  // Lyleen / Lyleen Noct 型:兩頭目僅 4.5 地圖單位,只有一隻的 spawner 被回報。
  const A = { x: 100, y: 100 };
  const B = { x: 104.5, y: 100 };
  const spawnerAtA = entry({ name: "sp", alive: true, x: -77988, y: 203900 }); // 地圖 (100,100)
  const m = bossStateMapCoord(spawnerAtA);
  assert.ok(Math.abs(m.x - 100) < 1e-6 && Math.abs(m.y - 100) < 1e-6, "spawner 應落在 (100,100)");
  const assigned = assignReportedBosses([A, B], [spawnerAtA]);
  assert.equal(assigned.get(A), spawnerAtA, "最近的 A 拿到 spawner");
  assert.equal(assigned.has(B), false, "B 未配到 → 狀態未知(不被鄰居冒充)");
});

test("assignReportedBosses:兩 spawner 兩頭目各自最近配對(不交叉)", () => {
  const A = { x: 0, y: 0 };
  const B = { x: 500, y: 0 };
  const spA = entry({ name: "a", x: -123888, y: 158000 }); // 地圖 (0,0)
  const spB = entry({ name: "b", x: -123888, y: 158000 + 500 * 459 }); // 地圖 (500,0)
  const assigned = assignReportedBosses([A, B], [spB, spA]); // 故意亂序
  assert.equal(assigned.get(A), spA);
  assert.equal(assigned.get(B), spB);
});

test("依世界分池(isWorldTreeCoord)後,主世界/世界樹 spawner 各歸各池——防 ±1000 撞號誤配", () => {
  // 兩套地圖座標都是 ±1000,純函式本身不分世界,呼叫端(web)必須先依世界分池。
  const treeSpawner = entry({ name: "tree", x: 520440, y: -727175 });
  const mainSpawner = entry({ name: "main", x: -1000, y: 200000 });
  const pool = [treeSpawner, mainSpawner];
  const mainReported = pool.filter((e) => !isWorldTreeCoord(e.x));
  const treeReported = pool.filter((e) => isWorldTreeCoord(e.x));
  assert.deepEqual(mainReported.map((e) => e.name), ["main"]);
  assert.deepEqual(treeReported.map((e) => e.name), ["tree"]);
});

// ── buildPublicMapBossPoints:公開地圖野外頭目狀態點產生器(agent 端跑,viewer 只渲染)──
// 註:地下城不進地圖(頭目層已涵蓋),此函式只處理野外/封印頭目。
const MAIN_00 = { x: -123888, y: 158000 }; // 世界座標 → 地圖 (0,0)

function mkState(patch: Partial<BossRespawnState>): BossRespawnState {
  return {
    version: 1,
    generatedAt: 1000,
    tick: 1,
    spawnerTotal: 0,
    bossCount: 0,
    aliveCount: 0,
    bosses: [],
    ...patch,
  };
}

function dungeonEntry(patch: Partial<DungeonBossEntry>): DungeonBossEntry {
  return { name: "地城", level: 60, bossState: 0, respawnAt: -1, x: 0, y: 0, z: 0, ...patch };
}

test("buildPublicMapBossPoints:state=null → 空陣列", () => {
  assert.deepEqual(buildPublicMapBossPoints(null, { field: [{ x: 0, y: 0 }], tree: [] }, 5000), []);
});

test("buildPublicMapBossPoints:野外頭目 dead → 發 st=dead + ra(秒)+ ms=false", () => {
  const state = mkState({
    bosses: [entry({ x: MAIN_00.x, y: MAIN_00.y, alive: false, diedAt: 1000, respawnedAt: -1 })],
  });
  const r = buildPublicMapBossPoints(state, { field: [{ x: 0, y: 0 }], tree: [] }, 2000);
  assert.deepEqual(r, [{ x: 0, y: 0, m: "world", st: "dead", ra: 1000 + DEFAULT_BOSS_RESPAWN_SECONDS, ms: false }]);
});

test("buildPublicMapBossPoints:野外頭目 alive → st=alive、無 ra", () => {
  const state = mkState({ bosses: [entry({ x: MAIN_00.x, y: MAIN_00.y, alive: true })] });
  const r = buildPublicMapBossPoints(state, { field: [{ x: 0, y: 0 }], tree: [] }, 2000);
  assert.equal(r.length, 1);
  assert.equal(r[0].st, "alive");
  assert.equal(r[0].ra, undefined);
});

test("buildPublicMapBossPoints:配對到但 unknown(alive=null、無擊殺紀錄)→ 不發點", () => {
  const state = mkState({ bosses: [entry({ x: MAIN_00.x, y: MAIN_00.y, alive: null })] });
  assert.deepEqual(buildPublicMapBossPoints(state, { field: [{ x: 0, y: 0 }], tree: [] }, 2000), []);
});

test("buildPublicMapBossPoints:世界樹 spawner 歸 tree 池、發 m=tree(不誤配主世界 catalog)", () => {
  const state = mkState({ bosses: [entry({ x: 520440, y: -727175, alive: true })] }); // 世界樹地圖約 (-467,13)
  const r = buildPublicMapBossPoints(state, { field: [{ x: 0, y: 0 }], tree: [{ x: -467, y: 13 }] }, 2000);
  assert.equal(r.length, 1);
  assert.equal(r[0].m, "tree");
  assert.equal(r[0].st, "alive");
});

test("buildPublicMapBossPoints:地城頭目 dead → 疊到同座標 catalog 點(精準時間 ms=true)", () => {
  const state = mkState({ dungeons: [dungeonEntry({ x: MAIN_00.x, y: MAIN_00.y, bossState: 1, respawnAt: 9000 })] });
  const r = buildPublicMapBossPoints(state, { field: [{ x: 0, y: 0 }], tree: [] }, 2000);
  assert.deepEqual(r, [{ x: 0, y: 0, m: "world", st: "dead", ra: 9000, ms: true }]);
});

test("buildPublicMapBossPoints:野外+地城不同座標可同時疊", () => {
  const state = mkState({
    bosses: [entry({ x: MAIN_00.x, y: MAIN_00.y, alive: false, diedAt: 1000, respawnedAt: -1 })], // 地圖 (0,0)
    dungeons: [dungeonEntry({ x: -123888, y: 158000 + 500 * 459, bossState: 1, respawnAt: 9000 })], // 地圖 (500,0)
  });
  const r = buildPublicMapBossPoints(state, { field: [{ x: 0, y: 0 }, { x: 500, y: 0 }], tree: [] }, 2000);
  assert.equal(r.length, 2);
  const byCoord = Object.fromEntries(r.map((p) => [`${p.x},${p.y}`, p]));
  assert.equal(byCoord["0,0"].st, "dead");
  assert.equal(byCoord["500,0"].st, "dead");
  assert.equal(byCoord["500,0"].ms, true);
});
