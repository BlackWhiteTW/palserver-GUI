import { FiCheck, FiDownload, FiPower } from "react-icons/fi";
import { t, useI18n } from "./i18n";
import { btn, btnGhost, card } from "./ui";

/**
 * 模組/外掛的統一安裝卡 —— 與「反作弊插件」分頁的版本卡同一種精簡造型:
 * 左:標題 + 徽章(已安裝/版本);右:按鈕列(安裝或更新 / 測試版 / 移除);
 * 下:整寬的說明與備註。PalDefender、UE4SS、PalSchema 三處共用,
 * 各分頁只提供資料與動作,不各自排版。
 */
export function ModInstallCard({
  title,
  titleExtra,
  desc,
  installed,
  version,
  running,
  busy,
  busyLabel,
  onInstall,
  installLabel,
  updateLabel,
  installTitle,
  onInstallBeta,
  enabled,
  onToggleEnabled,
  latestVersion,
  note,
  children,
}: {
  title: string;
  /** 標題右側的額外徽章(例:贊助者星星)。 */
  titleExtra?: React.ReactNode;
  /** 整寬說明文字(顯示在按鈕列下方)。 */
  desc?: string;
  installed: boolean;
  version?: string | null;
  /** 伺服器運作中:安裝/移除類動作停用並提示先停止。 */
  running: boolean;
  /** 任一動作進行中(停用整排按鈕)。 */
  busy: boolean;
  busyLabel?: string;
  /** 主按鈕:未安裝=安裝穩定版,已安裝=更新到最新版。不給就不顯示。 */
  onInstall?: () => void;
  installLabel?: string;
  updateLabel?: string;
  installTitle?: string;
  /** 測試版按鈕(有 beta 通道的元件才給)。 */
  onInstallBeta?: () => void;
  /** 已安裝時的啟用狀態(false=已停用;undefined=不支援/舊 agent,不顯示)。 */
  enabled?: boolean;
  /** 停用/啟用切換(不刪檔,改名主 DLL)。 */
  onToggleEnabled?: () => void;
  /** 最新穩定版 tag:與 version 不同時顯示「有新版」徽章。 */
  latestVersion?: string | null;
  /** 底部小字備註(desc 之後)。 */
  note?: React.ReactNode;
  /** 追加內容(警告區塊等),整寬顯示在 desc 與 note 之間。 */
  children?: React.ReactNode;
}) {
  useI18n();
  return (
    <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
      <div className="inline-flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-ink-muted">{title}</span>
        {titleExtra}
        {installed && (
          <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-grass/40 bg-grass/15 px-3 py-1 text-xs font-bold text-grass">
            <FiCheck className="size-3.5" />
            {t("已安裝")}{version ? ` ${version}` : ""}
          </span>
        )}
        {installed && enabled === false && (
          <span className="rounded-full border-[1.5px] border-line bg-card-soft px-3 py-1 text-xs font-bold text-ink-muted">
            {t("已停用")}
          </span>
        )}
        {installed && version && latestVersion && latestVersion !== version && (
          <span
            className="rounded-full border-[1.5px] border-sun/40 bg-sun/10 px-3 py-1 text-xs font-bold text-sun"
            title={t("改版後模組常需更新才相容;按「更新到最新版」升級")}
          >
            {t("有新版 {v}", { v: latestVersion })}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onInstall && (
          <button
            className={`${btn} inline-flex items-center gap-1.5`}
            onClick={onInstall}
            disabled={busy || running}
            title={running ? t("請先停止伺服器") : installTitle}
          >
            <FiDownload className="size-4" />
            {busy
              ? busyLabel ?? t("安裝中…")
              : installed
                ? updateLabel ?? t("更新到最新版")
                : installLabel ?? t("安裝穩定版")}
          </button>
        )}
        {onInstallBeta && (
          <button
            className={`${btnGhost} inline-flex items-center gap-1.5`}
            onClick={onInstallBeta}
            disabled={busy || running}
            title={running ? t("請先停止伺服器") : t("安裝最新測試版(含較新功能,可能不穩定)")}
          >
            {t("安裝測試版")}
          </button>
        )}
        {installed && onToggleEnabled && (
          <button
            className={`${btnGhost} inline-flex items-center gap-1.5`}
            onClick={onToggleEnabled}
            disabled={busy || running}
            title={
              running
                ? t("請先停止伺服器")
                : enabled === false
                  ? t("重新啟用(把 DLL 改回原名)")
                  : t("暫時停用不刪檔:改版後模組不相容時的安全退路,Lua/設定檔都會保留")
            }
          >
            <FiPower className="size-4" />
            {busy ? t("處理中…") : enabled === false ? t("啟用") : t("停用")}
          </button>
        )}

      </div>
      {desc && <p className="w-full text-[13px] text-ink-muted">{desc}</p>}
      {children && <div className="w-full">{children}</div>}
      {note && <p className="w-full text-xs text-ink-muted">{note}</p>}
    </div>
  );
}
