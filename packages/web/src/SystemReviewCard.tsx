import { useState } from "react";
import { FiActivity, FiCpu, FiHardDrive, FiRefreshCw, FiWifi, FiX, FiZap } from "react-icons/fi";
import type { AgentClient, ReviewRating, SystemReview } from "./api";
import { t, useI18n } from "./i18n";
import { btnGhost, card, errorCls } from "./ui";

/**
 * 配置評估健檢(進階顯示/贊助者):按一下實測主機的 CPU/RAM/磁碟寫入/對外網路,
 * 給逐項評級與總分。測試會實寫 64MB 到資料碟 + 對外連線採樣,約 2-5 秒,
 * 所以做成手動觸發不自動輪詢。
 */

const RATING_LABEL: Record<ReviewRating, string> = {
  good: "充裕",
  ok: "夠用",
  poor: "吃緊",
};
const RATING_CLS: Record<ReviewRating, string> = {
  good: "bg-grass/15 text-grass",
  ok: "bg-sun/15 text-sun",
  poor: "bg-berry/15 text-berry",
};

const fmtGB = (n: number) => `${(n / (1 << 30)).toFixed(n >= 100 * (1 << 30) ? 0 : 1)} GB`;

function RatingChip({ rating }: { rating: ReviewRating }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${RATING_CLS[rating]}`}>
      {t(RATING_LABEL[rating])}
    </span>
  );
}

export function SystemReviewCard({ client, onClose }: { client: AgentClient; onClose: () => void }) {
  useI18n();
  const [review, setReview] = useState<SystemReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setReview(await client.systemReview());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const s = review?.specs;
  const rows = review && s
    ? [
        {
          icon: <FiCpu className="size-4" />,
          label: t("處理器"),
          value: `${s.cpuModel}(${t("{n} 核", { n: s.cpuCores })}${s.cpuSpeedMHz ? ` · ${(s.cpuSpeedMHz / 1000).toFixed(1)}GHz` : ""})`,
          rating: review.cpu.rating,
        },
        {
          icon: <FiZap className="size-4" />,
          label: t("記憶體"),
          value: `${fmtGB(s.ramTotalBytes)}(${t("可用 {v}", { v: fmtGB(s.ramFreeBytes) })})`,
          rating: review.ram.rating,
        },
        {
          icon: <FiHardDrive className="size-4" />,
          label: t("資料碟"),
          value: `${t("剩餘 {v}", { v: fmtGB(s.diskFreeBytes) })} · ${t("實測寫入 {n} MB/s", { n: s.diskWriteMBps })}`,
          rating: review.disk.rating,
        },
        {
          icon: <FiWifi className="size-4" />,
          label: t("對外網路"),
          value:
            s.netAvgMs === null
              ? t("量不到(離線或防火牆)")
              : `${t("平均 {n} ms", { n: s.netAvgMs })} · ${t("抖動 {n} ms", { n: s.netJitterMs ?? 0 })}`,
          rating: review.network.rating,
        },
      ]
    : [];

  return (
    <div className={`${card} flex max-h-[90vh] flex-col gap-3 overflow-y-auto`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-extrabold text-ink-muted">
          <FiActivity className="size-4 text-pal" /> {t("配置評估健檢")}
        </h3>
        <div className="flex items-center gap-2">
          <button
            className={`${btnGhost} inline-flex shrink-0 items-center gap-1.5`}
            onClick={() => void run()}
            disabled={busy}
          >
            <FiRefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? t("檢測中(實測磁碟與網路,約 5 秒)…") : review ? t("重新檢測") : t("開始檢測")}
          </button>
          <button className={btnGhost} onClick={onClose} aria-label={t("關閉")}>
            <FiX className="size-4" />
          </button>
        </div>
      </div>

      {error && <p className={errorCls}>{error}</p>}

      {!review && !busy && (
        <p className="text-[13px] text-ink-muted">
          {t("實測這台主機的處理器 / 記憶體 / 磁碟寫入 / 對外網路,以「開帕魯專用伺服器」的需求給逐項評級與總分。")}
        </p>
      )}

      {review && s && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-ink-muted">{t("綜合評分")}</span>
              <span className={`text-3xl font-extrabold ${review.overall >= 80 ? "text-grass" : review.overall >= 55 ? "text-sun" : "text-berry"}`}>
                {review.overall}
                <span className="text-base text-ink-muted"> / 100</span>
              </span>
            </div>
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-muted">
              {t("門檻以帕魯專用伺服器需求為準:記憶體吃最兇(單實例 8-20GB),tick 吃單核,自動備份吃循序寫入。網路為對外連線代理指標,非玩家實際延遲。")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 rounded-xl bg-card-soft px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-2 text-[13px]">
                  <span className="shrink-0 text-pal">{r.icon}</span>
                  <span className="shrink-0 font-bold text-ink-muted">{r.label}</span>
                  <span className="truncate" title={r.value}>{r.value}</span>
                </span>
                <RatingChip rating={r.rating} />
              </div>
            ))}
          </div>

        </>
      )}
    </div>
  );
}
