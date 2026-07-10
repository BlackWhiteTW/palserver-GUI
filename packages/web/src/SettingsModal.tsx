import { useEffect, useState } from "react";
import { FiX, FiCopy, FiCheck, FiRefreshCw, FiSmartphone, FiKey, FiWifi, FiTrash2 } from "react-icons/fi";
import type { AgentClient, Connection, TelemetryStatus } from "./api";
import { copyText } from "./clipboard";
import { PrivacyModal } from "./PrivacyModal";
import { Overlay, card, btn, btnGhost } from "./ui";

/**
 * 設定頁:主要用來在「其他裝置」連進這台 agent —— 顯示配對碼、以及各個可連位址
 * (區網 / Tailscale)組好的一次性登入連結,可一鍵複製。也提供重新產生配對碼,
 * 以及進階的 API token(給自動化用)。
 */
export function SettingsModal({
  client,
  conn,
  onClose,
}: {
  client: AgentClient;
  conn: Connection;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [addrs, setAddrs] = useState<{ ip: string; tailscale: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryStatus | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    client.pairingCode().then((r) => setCode(r.pairingCode)).catch(() => setCode(null));
    client.agentAddresses().then((r) => setAddrs(r.addresses)).catch(() => setAddrs([]));
    client.telemetry().then(setTelemetry).catch(() => setTelemetry(null));
  }, [client]);

  // 用自己連進來的網址推得 scheme 與 port,組給其他裝置的登入連結。
  let scheme = "http:";
  let port = "8250";
  try {
    const u = new URL(conn.url);
    scheme = u.protocol;
    port = u.port || (scheme === "https:" ? "443" : "80");
  } catch {
    /* 保底 */
  }
  const linkFor = (ip: string) => `${scheme}//${ip}:${port}/?setup=${code ?? ""}`;

  const rotate = async () => {
    if (!confirm("重新產生配對碼?\n\n舊的配對碼與登入連結會立刻失效,已連線的裝置不受影響。")) return;
    setBusy(true);
    try {
      const r = await client.rotatePairingCode();
      setCode(r.pairingCode);
    } finally {
      setBusy(false);
    }
  };

  const clearData = () => {
    if (
      !confirm(
        "清除這個瀏覽器上的暫存資料?\n\n會清掉:已儲存的連線、看過的公告、地圖校正、偏好設定等。\n頁面會重新整理,伺服器與存檔完全不受影響。",
      )
    ) {
      return;
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* 忽略 */
    }
    // 逐一讓 cookie 過期
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
    location.reload();
  };

  return (
    <Overlay onClose={onClose}>
      <div className={`${card} flex w-[540px] max-w-full flex-col gap-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
            <FiSmartphone className="size-5 text-pal" /> 設定
          </h2>
          <button className="text-ink-muted transition hover:text-ink" onClick={onClose} aria-label="關閉">
            <FiX className="size-5" />
          </button>
        </div>

        {/* 在其他裝置連線 */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-extrabold">在其他裝置連線</h3>
          <p className="text-[13px] text-ink-muted">
            想在手機或另一台電腦管理這台伺服器?在那台裝置的瀏覽器打開下面的連結(或打開 agent 網址後輸入配對碼)即可登入。
            對方需要和這台主機在同一區網或 VPN 內。
          </p>

          <div>
            <p className="mb-1 text-xs font-bold text-ink-muted">配對碼</p>
            <Copyable text={code ?? "…"} mono big />
          </div>

          {addrs && addrs.length > 0 ? (
            // agent 已把最適合遠端連線的位址(Tailscale/VPN 優先)排在最前面,
            // 只給那一條 —— 列出一堆區網位址反而讓人不知道該複製哪個。
            <div>
              <p className="mb-1 text-xs font-bold text-ink-muted">一鍵登入連結(複製給其他裝置打開)</p>
              <div className="flex items-center gap-2">
                <Copyable text={linkFor(addrs[0].ip)} mono />
                {addrs[0].tailscale && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-pal/40 bg-pal/10 px-2 py-0.5 text-xs font-bold text-pal">
                    <FiWifi className="size-3" /> Tailscale
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-card-soft px-3 py-2 text-xs text-ink-muted">
              偵測不到區網/VPN 位址。若要讓其他裝置連線,請確認這台主機已連上區網或 VPN,
              並用該位址(例如 Tailscale 的 100.x)加上 <span className="font-mono">/?setup=配對碼</span> 開啟。
            </p>
          )}

          <div>
            <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={rotate} disabled={busy}>
              <FiRefreshCw className="size-4" /> {busy ? "產生中…" : "重新產生配對碼"}
            </button>
            <p className="mt-1 text-xs text-ink-muted">舊連結外流時可重設;重設後舊的配對碼即失效。</p>
          </div>
        </div>

        {/* 進階:API token */}
        <div className="border-t border-line pt-3">
          <button
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-muted hover:text-ink"
            onClick={() => setShowToken((v) => !v)}
          >
            <FiKey className="size-4" /> 進階:API token(自動化用)
          </button>
          {showToken &&
            (conn.token ? (
              <div className="mt-2">
                <Copyable text={conn.token} mono />
              </div>
            ) : (
              <p className="mt-2 rounded-xl bg-card-soft px-3 py-2 text-xs text-ink-muted">
                你目前是本機免密碼連線,手上沒有 token。API token 顯示在 agent 啟動的視窗裡(標示「API token」那行)。
              </p>
            ))}
        </div>

        {/* 匿名使用統計 */}
        {telemetry && (
          <div className="border-t border-line pt-3">
            <h3 className="text-sm font-extrabold">匿名使用統計</h3>
            <p className="mt-1 text-xs text-ink-muted">
              回報匿名的使用計數(安裝數、伺服器建立/啟動數、不重複玩家數),幫助我們了解使用規模。
              <b className="text-ink">不含任何個資、IP、伺服器名稱或存檔內容</b>,詳見
              <button className="underline underline-offset-2 hover:text-pal" onClick={() => setShowPrivacy(true)}>
                隱私權政策
              </button>
              。
            </p>
            {telemetry.envDisabled ? (
              <p className="mt-2 rounded-xl bg-card-soft px-3 py-2 text-xs text-ink-muted">
                已由環境變數 <span className="font-mono">PALSERVER_TELEMETRY=0</span> 強制停用。
              </p>
            ) : (
              <label className="mt-2 flex items-center gap-2 text-[13px] font-bold text-ink-muted">
                <input
                  type="checkbox"
                  className="accent-(--color-pal)"
                  checked={telemetry.enabled}
                  onChange={(e) => {
                    void client
                      .setTelemetry(e.target.checked)
                      .then(setTelemetry)
                      .catch(() => {});
                  }}
                />
                參與匿名使用統計
              </label>
            )}
          </div>
        )}
        {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}

        {/* 清除暫存資料 */}
        <div className="border-t border-line pt-3">
          <h3 className="text-sm font-extrabold">清除暫存資料</h3>
          <p className="mt-1 text-xs text-ink-muted">
            清掉這個瀏覽器上存的連線、看過的公告與偏好設定(localStorage / cookie)。
            遇到畫面卡舊資料、或想登出重連時很有用。<b className="text-ink">不會動到伺服器與存檔。</b>
          </p>
          <button
            className={`${btnGhost} mt-2 inline-flex items-center gap-1.5 text-berry hover:border-berry`}
            onClick={clearData}
          >
            <FiTrash2 className="size-4" /> 清除暫存並重新整理
          </button>
        </div>

        <div className="flex justify-end">
          <button className={btn} onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Copyable({ text, mono, big }: { text: string; mono?: boolean; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      onClick={copy}
      title="點擊複製"
      className={`flex w-full items-center justify-between gap-2 rounded-lg border-2 border-line bg-card-soft px-3 py-2 text-left transition hover:border-pal ${
        mono ? "font-mono" : ""
      } ${big ? "text-lg font-bold tracking-widest" : "text-sm"}`}
    >
      <span className="truncate">{text}</span>
      {copied ? (
        <FiCheck className="size-4 shrink-0 text-grass" />
      ) : (
        <FiCopy className="size-4 shrink-0 text-ink-muted" />
      )}
    </button>
  );
}
