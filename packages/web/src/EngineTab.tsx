import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiFileText, FiZap, FiServer, FiExternalLink, FiMail, FiX } from "react-icons/fi";
import {
  ENGINE_CATEGORY_LABELS,
  ENGINE_OPTIONS,
  ENGINE_PRESETS,
  type EngineOptionKey,
  type EngineOptionMeta,
  type EngineSettings,
  type EngineSettingsStatus,
} from "@palserver/shared";
import type { FileHealth } from "@palserver/shared";
import type { AgentClient } from "./api";
import { FileEditor } from "./FileManager";
import { ConfigCorruptModal } from "./ConfigCorruptModal";
import { LaunchOptionsCard } from "./LaunchOptionsCard";
import { usePromoConfig } from "./promoConfig";
import { useHiddenCards } from "./tabPrefs";
import { t, useI18n } from "./i18n";
import { EmptyState, btn, btnGhost, card, errorCls, inputCls } from "./ui";

const KEYS = Object.keys(ENGINE_OPTIONS) as EngineOptionKey[];

/** Effective value: what the server will use, i.e. the file value or the
 * engine default when the key is absent. */
const effective = (values: EngineSettings, key: EngineOptionKey) =>
  values[key] ?? ENGINE_OPTIONS[key].default;

/** bytes/s → Mbps 併列顯示(×8 ÷ 1,000,000),對照家用網路方案用。 */
function formatMbps(bytesPerSec: number): string {
  const mbps = (bytesPerSec * 8) / 1_000_000;
  const text = mbps >= 100 ? mbps.toFixed(0) : mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2);
  return `${text} Mbps`;
}

export function EngineTab({
  client,
  instanceId,
  running,
}: {
  client: AgentClient;
  instanceId: string;
  running: boolean;
}) {
  useI18n();
  const [status, setStatus] = useState<EngineSettingsStatus | null>(null);
  const [draft, setDraft] = useState<EngineSettings>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRaw, setEditingRaw] = useState(false);
  const [corrupt, setCorrupt] = useState<FileHealth | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { maintenanceService } = usePromoConfig();
  const [hiddenCards, setHiddenCards] = useHiddenCards();

  const refresh = useCallback(async () => {
    try {
      const [next, health] = await Promise.all([
        client.engineSettings(instanceId),
        client.configHealth(instanceId).catch(() => null),
      ]);
      setStatus(next);
      setDraft(Object.fromEntries(KEYS.map((k) => [k, effective(next.values, k)])));
      setCorrupt(health?.engine.corrupted ? health.engine : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, instanceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dirtyKeys = useMemo(() => {
    if (!status) return [];
    return KEYS.filter((k) => draft[k] !== effective(status.values, k));
  }, [draft, status]);

  if (!status) return <p className="text-ink-muted">{error ?? t("載入中…")}</p>;

  if (!status.supported) {
    return (
      <EmptyState icon={<FiZap />}>{status.reason}</EmptyState>
    );
  }

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  };

  const save = async (values: EngineSettings = draft) => {
    setSaving(true);
    setError(null);
    try {
      await client.updateEngineSettings(instanceId, values);
      flash(t("已儲存,重啟伺服器後生效"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (key: keyof typeof ENGINE_PRESETS) => {
    const preset = ENGINE_PRESETS[key];
    if (!confirm(t("套用「{label}」?\n\n{description}\n\n會覆蓋下方欄位,儲存後才寫入檔案。", { label: t(preset.label), description: t(preset.description) }))) return;
    setDraft({ ...draft, ...preset.values });
  };

  const grouped = new Map<string, EngineOptionKey[]>();
  for (const key of KEYS) {
    const label = t(ENGINE_CATEGORY_LABELS[ENGINE_OPTIONS[key].category]);
    grouped.set(label, [...(grouped.get(label) ?? []), key]);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className={errorCls}>{error}</p>}
      {notice && (
        <p className="rounded-xl bg-grass/10 px-3 py-2 text-[13px] font-bold text-grass">{notice}</p>
      )}

      <div className={`${card} flex flex-col gap-3`}>
        <h3 className="inline-flex items-center gap-2 text-sm font-extrabold">
          <FiZap className="size-4 text-pal" /> {t("效能預設組合")}
        </h3>
        <p className="text-[13px] text-ink-muted">
          {t("這些設定寫入伺服器的")} <code className="rounded bg-card-soft px-1.5 py-0.5 text-xs">Engine.ini</code>
          {t("。沒有萬用解 —— 提高 Tick 率吃 CPU,人數與據點越多越吃力。改完請觀察「玩家」分頁的伺服器 FPS。")}
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ENGINE_PRESETS) as (keyof typeof ENGINE_PRESETS)[]).map((key) => (
            <button key={key} className={btnGhost} onClick={() => applyPreset(key)} title={t(ENGINE_PRESETS[key].description)}>
              {t(ENGINE_PRESETS[key].label)}
            </button>
          ))}
          {status.path && (
            <button
              className={`${btnGhost} inline-flex items-center gap-1.5`}
              onClick={() => setEditingRaw(true)}
              disabled={!status.exists}
              title={status.exists ? t("直接編輯 Engine.ini") : t("檔案尚未產生")}
            >
              <FiFileText className="size-4" /> {t("編輯原始檔")}
            </button>
          )}
        </div>
        {!status.exists && <p className="text-[13px] text-sun">{status.reason}</p>}
      </div>

      {/* 推廣:不想自己顧效能/維運,交給我們的代管服務(可按叉叉收起,設定→卡片隱藏恢復) */}
      {!hiddenCards.includes("promo-maintenance") && (
      <div className="flex flex-col gap-3 rounded-(--radius-cute) border-2 border-pal/30 bg-pal/5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="inline-flex min-w-0 items-center gap-2 text-sm font-extrabold">
            <FiServer className="size-4 shrink-0 text-pal" /> {t("調校很煩?交給我們維護")}
          </h3>
          <button
            className="-mr-1 -mt-1 rounded-lg p-1 text-ink-muted transition hover:bg-card-soft hover:text-ink"
            onClick={() => setHiddenCards([...hiddenCards, "promo-maintenance"])}
            title={t("隱藏此卡片(可在設定恢復)")}
            aria-label={t("隱藏此卡片(可在設定恢復)")}
          >
            <FiX className="size-4" />
          </button>
        </div>
        <p className="text-[13px] text-ink-muted">
          {t("不想每次改版都自己救火、半夜還要爬起來救伺服器?")}
          <b className="text-ink">{t(maintenanceService.name)}</b>{t("幫你長期代管維護 ——")} {t(maintenanceService.tagline)}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            className={`${btn} inline-flex items-center gap-1.5`}
            href={maintenanceService.url}
            target="_blank"
            rel="noreferrer"
          >
            <FiExternalLink className="size-4" /> {t("了解維護方案")}
          </a>
          <a
            className={`${btnGhost} inline-flex items-center gap-1.5`}
            href={`mailto:${maintenanceService.email}`}
          >
            <FiMail className="size-4" /> {t("免費諮詢")}
          </a>
        </div>
      </div>
      )}

      {[...grouped.entries()].map(([category, keys]) => (
        <div key={category} className={card}>
          <h3 className="mb-1 text-sm font-extrabold text-ink-muted">{category}</h3>
          <div className="flex flex-col divide-y divide-line">
            {keys.map((key) => (
              <OptionRow
                key={key}
                optionKey={key}
                value={draft[key] ?? ENGINE_OPTIONS[key].default}
                fileValue={status.values[key]}
                onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
              />
            ))}
          </div>
        </div>
      ))}

      <LaunchOptionsCard client={client} instanceId={instanceId} category="perf" />

      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-(--radius-cute) border-2 border-sun/50 bg-card p-3 shadow-(--shadow-cute)">
          <span className="text-[13px] font-bold text-ink-muted">
            {t("小心~您有 {n} 項變更尚未儲存!(重啟伺服器後生效)", { n: dirtyKeys.length })}
          </span>
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => void refresh()} disabled={saving}>
              {t("重置")}
            </button>
            <button className={btn} onClick={() => save()} disabled={saving}>
              {saving ? t("儲存中…") : t("確定修改")}
            </button>
          </div>
        </div>
      )}

      {editingRaw && status.path && (
        <FileEditor
          client={client}
          instanceId={instanceId}
          path={status.path}
          onClose={() => setEditingRaw(false)}
          onSaved={refresh}
        />
      )}

      {corrupt && !dismissed && (
        <ConfigCorruptModal
          client={client}
          instanceId={instanceId}
          file="engine"
          health={corrupt}
          running={running}
          onResolved={() => {
            setDismissed(true);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function OptionRow({
  optionKey,
  value,
  fileValue,
  onChange,
}: {
  optionKey: EngineOptionKey;
  value: number | boolean;
  fileValue: number | boolean | undefined;
  onChange: (value: number | boolean) => void;
}) {
  // `as const satisfies` narrows each entry to its literal shape, so read it
  // back through the common interface to reach optional fields.
  useI18n();
  const meta: EngineOptionMeta = ENGINE_OPTIONS[optionKey];
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-64 flex-1">
        <p className="text-sm font-bold">
          {t(meta.label)}
          {fileValue === undefined && (
            <span className="ml-2 text-xs font-normal text-ink-muted">{t("(未設定,使用引擎預設)")}</span>
          )}
        </p>
        <p className="font-mono text-xs text-ink-muted">{optionKey}</p>
        {meta.hint && <p className="mt-1 max-w-xl text-xs text-ink-muted">{t(meta.hint)}</p>}
        {meta.warn && (
          <p className="mt-1 inline-flex max-w-xl items-start gap-1.5 text-xs text-sun">
            <FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {t(meta.warn)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {meta.type === "bool" ? (
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            aria-label={t(meta.label)}
            onClick={() => onChange(!value)}
            className={`relative h-7 w-12 rounded-full transition ${value ? "bg-grass" : "bg-line"}`}
          >
            <span
              className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${value ? "left-6" : "left-1"}`}
            />
          </button>
        ) : (
          <>
            {meta.showMbps && (
              <span className="font-mono text-xs whitespace-nowrap text-ink-muted">≈ {formatMbps(Number(value))}</span>
            )}
            <input
              type="number"
              className={`${inputCls} w-28 text-right`}
              value={String(value)}
              min={meta.min}
              max={meta.max}
              step={meta.step ?? (meta.type === "float" ? 0.1 : 1)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) onChange(meta.type === "int" ? Math.trunc(n) : n);
              }}
            />
            {meta.min !== undefined && meta.max !== undefined && (
              <input
                type="range"
                className="w-36 accent-(--color-pal) sm:w-48"
                value={Number(value)}
                min={meta.min}
                max={meta.max}
                step={meta.step ?? (meta.type === "float" ? 0.1 : 1)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange(meta.type === "int" ? Math.trunc(n) : n);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
