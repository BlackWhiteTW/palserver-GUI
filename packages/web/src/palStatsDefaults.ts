import { useEffect, useState } from "react";
import type { PalStatKey } from "@palserver/shared";

/**
 * 帕魯物種「原版數值」(DT_PalMonsterParameter 的現行預設值),給數值編輯器當
 * placeholder / 對比基準,並用實際 row 名清單校正 Boss_/BOSS_ 大小寫。
 *
 * 資料檔 game-data/pal-stats-defaults.json 由 scripts/fetch-pal-stats-defaults.mjs
 * 生成(遊戲改版時隨 game-data 維護流程重抓)。載入策略與 gameData 相同:
 * bundled 先上,背景抓 GitHub raw 最新版換上。檔案缺失時回空 —— UI 退回
 * 「不覆寫」placeholder,不影響功能。
 */

export type PalStatsDefaults = Record<string, Partial<Record<PalStatKey, number>>>;

const FILE = "pal-stats-defaults.json";
const REMOTE_BASE =
  "https://raw.githubusercontent.com/io-software-ai/palserver-gui/main/packages/web/public/game-data/";

let cache: PalStatsDefaults | null = null;
let inflight: Promise<PalStatsDefaults> | null = null;
let refreshed = false;
const listeners = new Set<(d: PalStatsDefaults) => void>();

async function fetchOne(base: string, opts?: RequestInit): Promise<PalStatsDefaults> {
  const res = await fetch(`${base}${FILE}`, opts);
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as PalStatsDefaults;
  return data && typeof data === "object" ? data : {};
}

async function load(): Promise<PalStatsDefaults> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      cache = await fetchOne("/game-data/").catch(() => ({}) as PalStatsDefaults);
      void refreshFromRemote();
      return cache;
    })();
  }
  return inflight;
}

async function refreshFromRemote(): Promise<void> {
  if (refreshed) return;
  refreshed = true;
  try {
    const remote = await fetchOne(REMOTE_BASE, { cache: "no-cache", signal: AbortSignal.timeout(15000) });
    if (Object.keys(remote).length && JSON.stringify(remote) !== JSON.stringify(cache)) {
      cache = remote;
      listeners.forEach((l) => l(remote));
    }
  } catch {
    /* 離線/被擋:留 bundled 版 */
  }
}

/** 原版數值表(載入前為 null;檔案缺失時為空物件)。 */
export function usePalStatsDefaults(): PalStatsDefaults | null {
  const [data, setData] = useState<PalStatsDefaults | null>(cache);
  useEffect(() => {
    let alive = true;
    void load().then((d) => alive && setData(d));
    const onChange = (d: PalStatsDefaults) => setData(d);
    listeners.add(onChange);
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);
  return data;
}

/**
 * 用實際 row 名清單校正大小寫:datamine 證實首領前綴大小寫不一致
 * (Boss_Anubis vs BOSS_BlackGriffon),寫錯的 row PalSchema 會靜默不套用。
 * 找不到(資料缺或該變體不存在)回傳原字串。
 */
export function resolveRowCase(defaults: PalStatsDefaults | null, row: string): string {
  if (!defaults || !row || defaults[row]) return row;
  const lower = row.toLowerCase();
  for (const key of Object.keys(defaults)) {
    if (key.toLowerCase() === lower) return key;
  }
  return row;
}
