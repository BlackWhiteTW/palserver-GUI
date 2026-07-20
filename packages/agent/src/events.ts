/**
 * Agent 內部事件匯流排。
 *
 * 專案原本沒有事件匯流排(各輪詢器各寫各的 JSON)。這裡提供一個極簡的單例 pub-sub,
 * 讓 presence / supervisor / log-event-tracker 等來源把「結構化伺服器事件」emit 出來,
 * webhook dispatcher(P2)訂閱這條匯流排即可,不必散落在各檔各自送 HTTP。
 *
 * data 的形狀對應 @palserver/shared 的各 *Data 型別(見該事件型別)。
 */

import { EventEmitter } from "node:events";
import {
  parseLogEvent,
  type WebhookEventType,
  type PlayerChatData,
  type PlayerDeathData,
  type PlayerCaptureData,
} from "@palserver/shared";

export interface AgentEvent<T = unknown> {
  type: WebhookEventType;
  instanceId: string;
  /** 事件發生時間(ISO8601)。 */
  occurredAt: string;
  data: T;
}

const CHANNEL = "event";
const bus = new EventEmitter();
bus.setMaxListeners(50); // dispatcher + 未來的 WS diff feed 等訂閱者,放寬預設 10 的警告

/** 送出一個結構化事件到匯流排。來源各自呼叫;fire-and-forget,訂閱者的錯誤不回傳。 */
export function emitAgentEvent(type: WebhookEventType, instanceId: string, data: unknown): void {
  const ev: AgentEvent = { type, instanceId, occurredAt: new Date().toISOString(), data };
  bus.emit(CHANNEL, ev);
}

/** 訂閱所有事件;回傳取消訂閱的函式。 */
export function onAgentEvent(handler: (ev: AgentEvent) => void): () => void {
  bus.on(CHANNEL, handler);
  return () => void bus.off(CHANNEL, handler);
}

/**
 * 一行 raw log → 要推送的事件型別 + data;非玩家 log 事件回 null。
 *
 * 只映射「log 才看得到」的 chat / death / capture —— join / leave 由 presence(REST 輪詢比對)
 * 負責,較可靠且不重複;connect(登入前)/ build 目前不推送。純函式,方便單元測試。
 */
export function logLineToEvent(
  line: string,
): { type: WebhookEventType; data: PlayerChatData | PlayerDeathData | PlayerCaptureData } | null {
  const p = parseLogEvent(line);
  if (!p) return null;
  switch (p.type) {
    case "chat":
      return { type: "player.chat", data: { name: p.name, channel: p.channel!, message: p.message! } };
    case "death":
      return { type: "player.death", data: { name: p.name, cause: p.cause!, pal: p.pal } };
    case "capture":
      return { type: "player.capture", data: { name: p.name, pal: p.pal! } };
    default:
      return null; // join / leave / connect / build
  }
}
