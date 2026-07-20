import type { LogSourceId } from "@palserver/shared";
import type { InstanceStore, InstanceRecord } from "./store.js";
import type { ServerDriver, DriverContext } from "./driver.js";
import { emitAgentEvent, logLineToEvent } from "./events.js";

/**
 * 背景常駐:對「有人訂閱且已授權」的執行中伺服器,跟隨日誌並把 chat / death / capture
 * 解析成結構化事件送上匯流排(join / leave 由 presence 負責,不在這裡)。
 *
 * 關鍵:follower 一律用 replay=0 附加 —— 只跟「新寫入」的行,絕不 replay 歷史,
 * 否則一接上就會把幾百行舊日誌當成新事件噴出去(舊死亡洗爆 Discord)。
 *
 * 這條路徑只能在真實伺服器上端到端驗證(本機 Mac 跑不動 PalServer);純解析邏輯
 * 在 events.logLineToEvent 有單元測試。
 */

const RECONCILE_MS = 10_000;

export class LogEventTracker {
  private timer: NodeJS.Timeout | null = null;
  /** instanceId → 停止 follower 的清理函式。 */
  private followers = new Map<string, () => void>();
  /** 正在 attach(streamLogs 尚未 resolve)的 instance,避免 reconcile 重入時重複附加。 */
  private attaching = new Set<string>();

  constructor(
    private store: InstanceStore,
    private driverFor: (rec: InstanceRecord) => ServerDriver,
    /** 是否要追這個實例(P2 注入:已授權 webhooks 且有訂閱 player.* log 事件)。 */
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
    for (const stop of this.followers.values()) stop();
    this.followers.clear();
    this.attaching.clear();
  }

  private async reconcile(): Promise<void> {
    const shouldFollow = new Set<string>();

    for (const rec of this.store.list()) {
      if (!this.wants(rec.id)) continue;
      const ctx: DriverContext = { instanceDir: this.store.instanceDir(rec.id) };
      const driver = this.driverFor(rec);
      let running = false;
      try {
        running = (await driver.status(rec, ctx)).status === "running";
      } catch {
        // 查不到狀態(伺服器正在起/停)——這輪跳過,下輪再評估。
        continue;
      }
      if (!running) continue;
      shouldFollow.add(rec.id);
      if (this.followers.has(rec.id) || this.attaching.has(rec.id)) continue;
      await this.attach(rec, ctx, driver);
    }

    // 已不該追的(停服 / 刪除 / 取消訂閱)——關掉 follower。
    for (const [id, stop] of this.followers) {
      if (!shouldFollow.has(id)) {
        stop();
        this.followers.delete(id);
      }
    }
  }

  private async attach(rec: InstanceRecord, ctx: DriverContext, driver: ServerDriver): Promise<void> {
    const sources = driver.logSources(rec, ctx);
    // 優先 PalDefender(事件最全);否則取第一個可用來源。
    const source: LogSourceId | undefined =
      sources.find((s) => s.available && s.id === "paldefender")?.id ??
      sources.find((s) => s.available)?.id;
    if (!source) return;

    this.attaching.add(rec.id);
    try {
      const stop = await driver.streamLogs(
        rec,
        ctx,
        (line) => {
          const m = logLineToEvent(line);
          if (m) emitAgentEvent(m.type, rec.id, m.data);
        },
        () => {}, // onEnd:檔案/串流結束——下輪 reconcile 會重新評估是否重附
        source,
        0, // replay=0:只跟新行,不 replay 歷史
      );
      // attach 期間若已判定不該再追(例如同輪關服),立即收掉。
      if (this.followers.has(rec.id)) stop();
      else this.followers.set(rec.id, stop);
    } catch {
      // driver 起 follower 失敗——下輪重試。
    } finally {
      this.attaching.delete(rec.id);
    }
  }
}
