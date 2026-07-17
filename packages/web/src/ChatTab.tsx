import { useEffect, useRef, useState } from "react";
import type { AgentClient } from "./api";
import { t, useI18n } from "./i18n";
import { btn, inputCls } from "./ui";

export interface ChatLine {
  ts: string;
  channel: string;
  player: string;
  message: string;
  type: "chat" | "broadcast";
}

const CHAT_RE = /\[Chat::(\w+)\]\['([^']+)'[^\]]*\]:\s?(.*)$/;

/**
 * 伺服器聊天室：即時顯示玩家對話（透過 PalDefender 日誌串流），
 * 並在下方的輸入框發送管理員廣播（走 REST API，支援中文）。
 */
export function ChatTab({
  client,
  instanceId,
  running,
}: {
  client: AgentClient;
  instanceId: string;
  running: boolean;
}) {
  useI18n();
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [palDefenderFound, setPalDefenderFound] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 偵測 PalDefender 日誌來源是否存在
  useEffect(() => {
    client.logSources(instanceId).then((sources) => {
      setPalDefenderFound(sources.some((s) => s.id === "paldefender"));
    }).catch(() => setPalDefenderFound(false));
  }, [client, instanceId]);

  // WebSocket 串流 PalDefender 日誌,過濾聊天行
  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      socket = client.logsSocket(instanceId, "paldefender");
      socket.onmessage = (ev) => {
        const raw = String(ev.data);
        const m = raw.match(CHAT_RE);
        if (m) {
          setLines((prev) =>
            [...prev.slice(-499), {
              ts: new Date().toLocaleTimeString(),
              channel: m[1],
              player: m[2],
              message: m[3],
              type: "chat" as const,
            }].slice(-500),
          );
        }
      };
      socket.onclose = () => {
        if (!closed) setTimeout(connect, 5000);
      };
      socket.onerror = () => {
        // 會觸發 onclose
      };
    };
    connect();
    return () => {
      closed = true;
      socket?.close();
    };
  }, [client, instanceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = msg.trim();
    if (!text) return;
    setSending(true);
    try {
      await client.announce(instanceId, text);
      setLines((prev) => [
        ...prev.slice(-499),
        { ts: new Date().toLocaleTimeString(), channel: "Broadcast", player: t("管理員"), message: text, type: "broadcast" as const },
      ]);
      setMsg("");
    } catch {
      // 錯誤不崩潰，訊息仍在輸入框中
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {palDefenderFound === false && (
        <p className="rounded-xl border-2 border-sun/40 bg-sun/10 px-3 py-2 text-xs text-sun">
          {t("PalDefender 未安裝或 logChat 未啟用 — 玩家聊天對話不會在此顯示。")}
        </p>
      )}
      {palDefenderFound === true && !running && (
        <p className="rounded-xl border-2 border-line bg-card-soft px-3 py-2 text-xs text-ink-muted">
          {t("伺服器未執行，暫時無法接收聊天訊息。")}
        </p>
      )}

      <div className="h-[440px] overflow-y-auto rounded-cute border-2 border-line bg-card-soft p-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 && (
          <p className="text-ink-muted">{t("等待聊天訊息…")}</p>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className={line.type === "broadcast" ? "text-pal" : "text-ink"}
          >
            <span className="text-ink-muted">[{line.ts}]</span>
            {line.type === "broadcast" ? (
              <span>
                {" "}
                <span className="font-bold">{line.player}</span>: {line.message}
              </span>
            ) : (
              <span>
                {" "}
                <span className="font-bold">{line.player}</span>: {line.message}
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          className={`${inputCls} flex-1`}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={t("輸入要廣播給所有玩家的訊息…")}
          maxLength={500}
        />
        <button className={btn} disabled={sending || !msg.trim()}>
          {sending ? t("傳送中…") : t("傳送")}
        </button>
      </form>
    </div>
  );
}
