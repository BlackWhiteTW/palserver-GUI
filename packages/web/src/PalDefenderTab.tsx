import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck, FiFileText, FiKey, FiServer, FiShield } from "react-icons/fi";
import {
  PALDEFENDER_OPTIONS,
  PD_CATEGORY_LABELS,
  type PalDefenderConfig,
  type PalDefenderConfigStatus,
  type PdOptionCategory,
  type PdOptionKey,
  type PdOptionMeta,
  type PdRestStatus,
} from "@palserver/shared";
import type { AgentClient } from "./api";
import { FileEditor } from "./FileManager";
import { CustomPalCard } from "./CustomPalCard";
import { t, useI18n } from "./i18n";
import { btn, btnGhost, card, errorCls, inputCls } from "./ui";

const KEYS = Object.keys(PALDEFENDER_OPTIONS) as PdOptionKey[];
const RAW_PATH = "Pal/Binaries/Win64/PalDefender/Config.json";
const effective = (values: PalDefenderConfig, k: PdOptionKey) =>
  values[k] ?? PALDEFENDER_OPTIONS[k].default;

export function PalDefenderTab({
  client,
  instanceId,
  running,
}: {
  client: AgentClient;
  instanceId: string;
  running: boolean;
}) {
  useI18n();
  const [status, setStatus] = useState<PalDefenderConfigStatus | null>(null);
  const [draft, setDraft] = useState<PalDefenderConfig>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRaw, setEditingRaw] = useState<string | null>(null);
  const [rest, setRest] = useState<PdRestStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [next, restStatus] = await Promise.all([
        client.palDefenderConfig(instanceId),
        client.palDefenderRest(instanceId).catch(() => null),
      ]);
      setStatus(next);
      setRest(restStatus);
      setDraft(Object.fromEntries(KEYS.map((k) => [k, effective(next.values, k)])));
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
      <div className="rounded-(--radius-cute) border-2 border-dashed border-line px-6 py-12 text-center text-ink-muted">
        <FiShield className="mx-auto mb-2 size-11" />
        <p className="mt-1 text-[13px]">{status.reason}</p>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await client.updatePalDefenderConfig(instanceId, draft);
      setNotice(t("已儲存並嘗試熱重載(若 RCON 未啟用則於重啟後生效)"));
      setTimeout(() => setNotice(null), 3500);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const grouped = new Map<string, PdOptionKey[]>();
  for (const key of KEYS) {
    const label = t(PD_CATEGORY_LABELS[PALDEFENDER_OPTIONS[key].category as PdOptionCategory]);
    grouped.set(label, [...(grouped.get(label) ?? []), key]);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className={errorCls}>{error}</p>}
      {notice && (
        <p className="rounded-xl bg-grass/10 px-3 py-2 text-[13px] font-bold text-grass">{notice}</p>
      )}

      <CustomPalCard client={client} instanceId={instanceId} />

      <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <p className="inline-flex items-center gap-2 text-sm font-extrabold">
          <FiShield className="size-4 text-pal" /> {t("PalDefender 反外掛設定")}
        </p>
        <button
          className={`${btnGhost} inline-flex items-center gap-1.5`}
          onClick={() => setEditingRaw(RAW_PATH)}
          disabled={!status.exists}
          title={status.exists ? t("直接編輯 Config.json") : t("檔案尚未產生")}
        >
          <FiFileText className="size-4" /> {t("編輯 Config.json")}
        </button>
      </div>
      {!status.exists && status.reason && <p className="text-[13px] text-sun">{status.reason}</p>}

      <RestStatusCard
        rest={rest}
        running={running}
        onToggle={async (enabled) => {
          setError(null);
          try {
            await client.setPalDefenderRestEnabled(instanceId, enabled);
            setNotice(enabled ? t("已啟用 REST API — 重啟伺服器後生效") : t("已停用 REST API — 重啟後生效"));
            setTimeout(() => setNotice(null), 4000);
            await refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
        onProvisionToken={async () => {
          setError(null);
          try {
            await client.provisionPalDefenderToken(instanceId, rest?.hasToken ?? false);
            setNotice(t("存取權杖已就緒 — 若查詢顯示尚未生效,重啟伺服器一次"));
            setTimeout(() => setNotice(null), 4000);
            await refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />

      {[...grouped.entries()].map(([category, keys]) => (
        <div key={category} className={card}>
          <h3 className="mb-1 text-sm font-extrabold text-ink-muted">{category}</h3>
          <div className="flex flex-col divide-y divide-line">
            {keys.map((key) => (
              <OptionRow
                key={key}
                optionKey={key}
                value={draft[key] ?? PALDEFENDER_OPTIONS[key].default}
                fileValue={status.values[key]}
                onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
              />
            ))}
          </div>
        </div>
      ))}

      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-(--radius-cute) border-2 border-sun/50 bg-card p-3 shadow-(--shadow-cute)">
          <span className="text-[13px] font-bold text-ink-muted">
            {t("小心~您有 {n} 項變更尚未儲存!", { n: dirtyKeys.length })}
          </span>
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => void refresh()} disabled={saving}>
              {t("重置")}
            </button>
            <button className={btn} onClick={save} disabled={saving}>
              {saving ? t("儲存中…") : t("確定修改")}
            </button>
          </div>
        </div>
      )}

      {editingRaw && (
        <FileEditor
          client={client}
          instanceId={instanceId}
          path={editingRaw}
          onClose={() => setEditingRaw(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

/** REST API status: a toggle to enable it (which unlocks player detail) and a
 * button to provision the access token — no raw file editing needed. */
function RestStatusCard({
  rest,
  running,
  onToggle,
  onProvisionToken,
}: {
  rest: PdRestStatus | null;
  running: boolean;
  onToggle: (enabled: boolean) => void;
  onProvisionToken: () => void;
}) {
  if (!rest || !rest.installed) return null;

  return (
    <div className={`${card} flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-extrabold">
          <FiServer className="size-4 text-pal" /> PalDefender REST API
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={rest.enabled}
          aria-label={t("啟用 REST API")}
          onClick={() => rest.configExists && onToggle(!rest.enabled)}
          disabled={!rest.configExists}
          className={`relative h-7 w-12 rounded-full transition disabled:opacity-40 ${rest.enabled ? "bg-grass" : "bg-line"}`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${rest.enabled ? "left-6" : "left-1"}`}
          />
        </button>
      </div>

      <p className="text-[13px] text-ink-muted">
        {!rest.configExists
          ? rest.reason ?? t("尚未生成 REST 設定 — 啟動一次伺服器即會產生。")
          : rest.enabled
            ? t("啟用後,可在玩家分頁點玩家查看其帕魯與背包。變更需重啟伺服器才會生效。")
            : t("啟用後,可在玩家分頁點玩家查看其帕魯與背包。")}
      </p>

      {rest.enabled && rest.configExists && (
        <div className="flex flex-wrap items-center gap-3 border-t-2 border-line pt-3">
          <span className="text-[13px] font-bold">
            {t("存取權杖:")}
            {rest.hasToken ? (
              <span className="ml-1 inline-flex items-center gap-1 text-grass">
                <FiCheck className="size-3.5" /> {t("已設定")}
              </span>
            ) : (
              <span className="ml-1 text-sun">{t("尚未設定")}</span>
            )}
          </span>
          <button
            className={`${rest.hasToken ? btnGhost : btn} inline-flex items-center gap-1.5`}
            onClick={onProvisionToken}
          >
            <FiKey className="size-4" /> {rest.hasToken ? t("重新產生權杖") : t("建立存取權杖")}
          </button>
          <span className="text-xs text-ink-muted">{t("agent 用它讀取玩家資料,只在本機使用。")}</span>
        </div>
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
  optionKey: PdOptionKey;
  value: number | boolean;
  fileValue: number | boolean | undefined;
  onChange: (value: number | boolean) => void;
}) {
  useI18n();
  const meta: PdOptionMeta = PALDEFENDER_OPTIONS[optionKey];
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-64 flex-1">
        <p className="text-sm font-bold">
          {t(meta.label)}
          {fileValue === undefined && (
            <span className="ml-2 text-xs font-normal text-ink-muted">{t("(未設定,使用預設)")}</span>
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
          <input
            type="number"
            className={`${inputCls} w-28 text-right`}
            value={String(value)}
            min={meta.min}
            max={meta.max}
            step={meta.type === "float" ? meta.step : 1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onChange(meta.type === "int" ? Math.trunc(n) : n);
            }}
          />
        )}
      </div>
    </div>
  );
}
