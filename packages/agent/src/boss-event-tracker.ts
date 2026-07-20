import type { InstanceStore, InstanceRecord } from "./store.js";
import type { ServerDriver, DriverContext } from "./driver.js";
import { emitAgentEvent } from "./events.js";
import { readBossState } from "./boss-reporter.js";

/**
 * 背景常駐:對「有人訂閱且已授權」的執行中伺服器,輪詢頭目回報模組寫出的狀態檔,
 * 偵測每個頭目 spawner 的 alive 轉移並 emit:true→false = boss.killed、false→true = boss.respawn。
 *
 * 需伺服器裝了頭目回報 mod(UE4SS Lua,見 boss-reporter.ts);沒裝就讀不到狀態、自然不 emit。
 * alive 為 null(遺體被清 / 玩家不在附近 = 未知)時保留上次已知值當基準、不判轉移,
 * 避免「暫時看不到」被誤判成擊殺。首次觀測只建基準不 emit(不補發啟動前就已存在的狀態)。
 */

const RECONCILE_MS = 15_000; // 對齊 mod 寫檔頻率(~15s)

export class BossEventTracker {
  private timer: NodeJS.Timeout | null = null;
  /** instanceId → (boss name → 上次已知 alive)。 */
  private lastAlive = new Map<string, Map<string, boolean>>();

  constructor(
    private store: InstanceStore,
    private driverFor: (rec: InstanceRecord) => ServerDriver,
    /** 是否要追這個實例(P2 注入:已授權且有訂閱 boss.*)。 */
    private wants: (id: string) => boolean,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_MS);
    this.timer.unref();
    void this.reconcile();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastAlive.clear();
  }

  private async reconcile(): Promise<void> {
    for (const rec of this.store.list()) {
      if (!this.wants(rec.id)) {
        this.lastAlive.delete(rec.id);
        continue;
      }
      const ctx: DriverContext = { instanceDir: this.store.instanceDir(rec.id) };
      try {
        if ((await this.driverFor(rec).status(rec, ctx)).status !== "running") continue;
      } catch {
        continue;
      }
      const state = await readBossState(rec, ctx).catch(() => null);
      if (!state || !Array.isArray(state.bosses)) continue;

      const prev = this.lastAlive.get(rec.id) ?? new Map<string, boolean>();
      const next = new Map<string, boolean>();
      for (const b of state.bosses) {
        if (typeof b.alive !== "boolean") {
          const carried = prev.get(b.name);
          if (carried !== undefined) next.set(b.name, carried); // 未知:保留基準,不判轉移
          continue;
        }
        next.set(b.name, b.alive);
        const was = prev.get(b.name);
        if (was === true && b.alive === false) {
          emitAgentEvent("boss.killed", rec.id, { bossId: b.name, name: b.name });
        } else if (was === false && b.alive === true) {
          emitAgentEvent("boss.respawn", rec.id, { bossId: b.name, name: b.name });
        }
      }
      this.lastAlive.set(rec.id, next);
    }
  }
}
