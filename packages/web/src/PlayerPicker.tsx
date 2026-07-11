import { FiX } from "react-icons/fi";
import type { KnownPlayer } from "@palserver/shared";
import { t, useI18n } from "./i18n";
import { inputCls } from "./ui";

/** 玩家的顯示名(名冊裡的取 name/accountName,否則就是原始 id)。 */
const playerLabel = (p: KnownPlayer) => p.name || p.accountName || p.userId;

/**
 * 統一的「選擇玩家」欄位:指令列表與自訂帕魯共用。
 * 名冊(在線 + 歷史)做成下拉,已選只顯示名稱 —— 畫面上不出現 SteamId。
 * 名冊外的玩家(例如要解封的離線玩家)仍可手動輸入 UserId。
 */
export function PlayerPicker({
  roster,
  value,
  onChange,
  allowManual = true,
  placeholder,
}: {
  roster: KnownPlayer[];
  value: string;
  onChange: (userId: string) => void;
  /** 允許直接輸入名冊裡沒有的 UserId(預設允許) */
  allowManual?: boolean;
  placeholder?: string;
}) {
  useI18n();
  const online = roster.filter((p) => p.online);
  const offline = roster.filter((p) => !p.online);
  const known = roster.find((p) => p.userId === value);

  // 已選:只顯示名稱(名冊有名字就用名字,手動輸入的就顯示那串 id),不露 SteamId。
  if (value) {
    return (
      <div className={`${inputCls} flex min-w-0 items-center gap-2`}>
        <span className="min-w-0 flex-1 truncate font-bold text-ink">
          {known ? playerLabel(known) : value}
        </span>
        <button
          type="button"
          className="shrink-0 text-ink-muted transition hover:text-berry"
          onClick={() => onChange("")}
          aria-label={t("清除")}
        >
          <FiX className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {roster.length > 0 && (
        <select
          className={`${inputCls} appearance-none`}
          value=""
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("— 選擇玩家 —")}</option>
          {online.length > 0 && (
            <optgroup label={t("在線")}>
              {online.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {playerLabel(p)}
                </option>
              ))}
            </optgroup>
          )}
          {offline.length > 0 && (
            <optgroup label={t("離線(歷史玩家)")}>
              {offline.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {playerLabel(p)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
      {allowManual && (
        <input
          className={inputCls}
          value=""
          onChange={(e) => onChange(e.target.value)}
          placeholder={roster.length > 0 ? t("或直接輸入 UserId") : (placeholder ?? t("輸入 UserId"))}
        />
      )}
    </div>
  );
}
