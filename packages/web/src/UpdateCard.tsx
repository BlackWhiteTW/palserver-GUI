import { useCallback, useEffect, useRef, useState } from "react";
import { FiDownload, FiCheck, FiRefreshCw, FiExternalLink, FiAlertTriangle } from "react-icons/fi";
import type { AgentUpdateStatus } from "@palserver/shared";
import type { AgentClient } from "./api";
import { t, useI18n } from "./i18n";
import { btn, btnGhost, errorCls } from "./ui";

/**
 * 設定頁裡的「GUI 更新」區塊:顯示目前版本、GitHub 上有沒有新版,並提供一鍵更新。
 *
 * 更新中 agent 會換掉自己的執行檔然後重啟,所以連線會斷幾秒 —— 這段期間我們持續
 * 輪詢,等它以新版本回來(或把失敗原因顯示出來)。
 */
export function UpdateCard({ client }: { client: AgentClient }) {
  useI18n();
  const [status, setStatus] = useState<AgentUpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const startedFrom = useRef<string | null>(null);
  const errorBefore = useRef<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      try {
        setStatus(await client.updateStatus(force));
      } catch {
        /* agent 重啟中:輪詢會繼續試 */
      }
    },
    [client],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // 更新進行中(下載/換檔/重啟)就密集輪詢,直到版本變了或回到 idle。
  const busy = restarting || (status !== null && status.phase !== "idle");
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [busy, load]);

  useEffect(() => {
    if (!restarting || !status) return;
    // agent 帶著新版本回來了 —— 前端資源也換了,重新整理才拿得到新的 UI。
    if (startedFrom.current && status.currentVersion !== startedFrom.current) location.reload();
    // 換檔中途失敗(agent 沒重啟,只是記下錯誤)。停止輪詢,錯誤由 lastError 呈現。
    else if (status.phase === "idle" && status.lastError !== errorBefore.current) setRestarting(false);
  }, [restarting, status]);

  const check = async () => {
    setChecking(true);
    setError(null);
    await load(true);
    setChecking(false);
  };

  const apply = async () => {
    if (!confirm(t("更新到 {version}?\n\nagent 會重新啟動(約數秒),執行中的遊戲伺服器不受影響。", { version: status?.latestVersion ?? "?" }))) {
      return;
    }
    setError(null);
    startedFrom.current = status?.currentVersion ?? null;
    errorBefore.current = status?.lastError ?? null;
    try {
      await client.applyUpdate();
      setRestarting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!status) return null;

  return (
    <div className="border-t border-line pt-3">
      <h3 className="text-sm font-extrabold">{t("GUI 更新")}</h3>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        <span>
          {t("目前版本")} <span className="font-mono text-ink">{status.currentVersion}</span>
        </span>
        {status.latestVersion && !status.updateAvailable && (
          <span className="inline-flex items-center gap-1 text-grass">
            <FiCheck className="size-3.5" /> {t("已是最新版")}
          </span>
        )}
        {status.checkedAt && <span className="opacity-70">· {t("檢查於")} {new Date(status.checkedAt).toLocaleString()}</span>}
      </div>

      {status.updateAvailable ? (
        <div className="mt-2 rounded-xl border-2 border-pal/30 bg-pal/5 px-3 py-2">
          <p className="inline-flex items-center gap-2 text-[13px] font-bold">
            <FiDownload className="size-4 text-pal" />
            {t("有新版本")} <span className="font-mono">{status.latestVersion}</span>
            {status.downloadSizeBytes && (
              <span className="font-normal text-ink-muted">
                ({(status.downloadSizeBytes / 1024 / 1024).toFixed(1)} MB)
              </span>
            )}
          </p>

          {busy ? (
            <p className="mt-2 text-xs text-ink-muted">{phaseLabel(status)}</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className={`${btn} inline-flex items-center gap-1.5`} onClick={apply} disabled={!status.supported}>
                <FiDownload className="size-4" /> {t("立即更新")}
              </button>
              {status.releaseUrl && (
                <a
                  className={`${btnGhost} inline-flex items-center gap-1.5`}
                  href={status.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FiExternalLink className="size-4" /> {t("更新說明")}
                </a>
              )}
            </div>
          )}
        </div>
      ) : (
        <button className={`${btnGhost} mt-2 inline-flex items-center gap-1.5`} onClick={check} disabled={checking}>
          <FiRefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} /> {checking ? t("檢查中…") : t("檢查更新")}
        </button>
      )}

      {!status.supported && status.reason && (
        <p className="mt-2 inline-flex items-start gap-1.5 rounded-xl bg-card-soft px-3 py-2 text-xs text-ink-muted">
          <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {status.reason}
        </p>
      )}
      {status.lastError && !busy && <p className={`${errorCls} mt-2`}>{t("上次更新失敗:")}{status.lastError}</p>}
      {error && <p className={`${errorCls} mt-2`}>{error}</p>}

      {status.prefs.envDisabled ? (
        <p className="mt-2 rounded-xl bg-card-soft px-3 py-2 text-xs text-ink-muted">
          {t("已由環境變數")} <span className="font-mono">PALSERVER_AUTO_UPDATE=0</span> {t("停用自動更新。")}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          <Toggle
            checked={status.prefs.autoCheck}
            label={t("自動檢查新版本(每 6 小時,只通知不安裝)")}
            onChange={(v) => void client.setUpdatePrefs({ autoCheck: v }).then(setStatus)}
          />
          <Toggle
            checked={status.prefs.autoApply}
            disabled={!status.prefs.autoCheck || !status.supported}
            label={t("查到新版就自動安裝並重啟 agent")}
            onChange={(v) => void client.setUpdatePrefs({ autoApply: v }).then(setStatus)}
          />
          <Toggle
            checked={status.prefs.channel === "prerelease"}
            label={t("接收測試版(prerelease)")}
            onChange={(v) => void client.setUpdatePrefs({ channel: v ? "prerelease" : "stable" }).then(setStatus)}
          />
        </div>
      )}
    </div>
  );
}

function phaseLabel(status: AgentUpdateStatus): string {
  switch (status.phase) {
    case "downloading":
      return t("下載中… {pct}%", { pct: status.progress ?? 0 });
    case "verifying":
      return t("驗證檔案完整性(SHA256)…");
    case "extracting":
      return t("解壓縮…");
    case "swapping":
      return t("替換程式檔…");
    case "restarting":
      return t("agent 重新啟動中,稍候會自動重新整理…");
    default:
      return t("等待 agent 回應…");
  }
}

function Toggle({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-2 text-[13px] font-bold text-ink-muted ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        className="accent-(--color-pal)"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
