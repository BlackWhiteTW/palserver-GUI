import { useState } from "react";
import { FiAlertTriangle, FiCheck, FiPlay, FiX } from "react-icons/fi";
import type { AgentClient, PortsCheckResult, PortCheckEntry } from "./api";
import { t, useI18n } from "./i18n";
import { Overlay, btn, btnGhost, card, errorCls, inputCls } from "./ui";

/** 埠的顯示名稱與一句話說明(新手看得懂為什麼有這顆埠)。 */
const PORT_INFO: Record<PortCheckEntry["key"], { label: string; hint: string }> = {
  game: { label: "遊戲埠(UDP)", hint: "朋友連進伺服器用的主要埠。" },
  query: { label: "查詢埠(UDP)", hint: "Steam 伺服器瀏覽器查狀態用。" },
  rest: { label: "REST API 埠(TCP)", hint: "GUI 跟伺服器溝通用(玩家清單/存檔等)。" },
  rcon: { label: "RCON 埠(TCP)", hint: "遠端指令通道。" },
  paldefender: { label: "PalDefender 埠(TCP)", hint: "PalDefender 模組的 API 通道。" },
};

/**
 * 啟動前偵測到埠被其他程式占用時的修改面板:
 * 每個被占用的埠預填「建議替代埠」,一鍵套用後直接啟動。
 * (占用者通常是另一台伺服器、上一次沒關乾淨的殘留行程,或其他程式。)
 */
export function PortConflictModal({
  client,
  instanceId,
  check,
  onResolved,
  onClose,
}: {
  client: AgentClient;
  instanceId: string;
  check: PortsCheckResult;
  /** 埠改好之後呼叫(呼叫端接著啟動伺服器)。 */
  onResolved: () => void;
  onClose: () => void;
}) {
  useI18n();
  const conflicts = check.ports.filter((p) => !p.free);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(conflicts.map((p) => [p.key, String(p.suggestion ?? p.port)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const patch: Partial<Record<PortCheckEntry["key"], number>> = {};
      for (const p of conflicts) {
        const v = Number(values[p.key]);
        if (!Number.isInteger(v) || v < 1024 || v > 65535) {
          throw new Error(t("{name} 需為 1024–65535 的數字", { name: t(PORT_INFO[p.key].label) }));
        }
        if (v !== p.port) patch[p.key] = v;
      }
      if (Object.keys(patch).length > 0) await client.portsUpdate(instanceId, patch);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div
        className={`${card} flex max-h-[85vh] w-120 max-w-full flex-col gap-3 overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
          <FiAlertTriangle className="size-5 text-sun" /> {t("有埠被占用了")}
        </h2>
        <p className="text-[13px] text-ink-muted">
          {t("以下埠已被其他程式占用(可能是另一台伺服器或殘留行程),伺服器會開不起來。已幫你找好可用的替代埠,按「改用並啟動」即可;也可以自行修改。")}
        </p>

        {conflicts.map((p) => (
          <div key={p.key} className="rounded-xl border-2 border-line px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold">{t(PORT_INFO[p.key].label)}</p>
                <p className="text-xs text-ink-muted">{t(PORT_INFO[p.key].hint)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-berry/10 px-2 py-0.5 font-mono text-xs font-extrabold text-berry line-through">
                  {p.port}
                </span>
                <span className="text-ink-muted">→</span>
                <input
                  className={`${inputCls} w-24 font-mono`}
                  type="number"
                  min={1024}
                  max={65535}
                  value={values[p.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                />
              </div>
            </div>
          </div>
        ))}

        {check.ports.some((p) => p.free) && (
          <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <FiCheck className="size-3.5 text-grass" />
            {t("其餘 {n} 個埠可用,不需修改。", { n: check.ports.filter((p) => p.free).length })}
          </p>
        )}

        {error && <p className={errorCls}>{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className={`${btn} inline-flex items-center gap-1.5`} onClick={() => void apply()} disabled={busy}>
            <FiPlay className="size-4" /> {busy ? t("套用中…") : t("改用這些埠並啟動")}
          </button>
          <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={onClose} disabled={busy}>
            <FiX className="size-4" /> {t("取消")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
