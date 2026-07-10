import { useEffect, useRef, useState } from "react";
import { FiCpu, FiActivity, FiClock, FiLayers, FiZap, FiHardDrive } from "react-icons/fi";
import type { InstanceStats, LiveStatus } from "@palserver/shared";
import type { AgentClient } from "./api";
import { card } from "./ui";

/** 走勢圖保留的取樣點數(約 5 分鐘,以 5 秒輪詢計)。 */
const HISTORY = 60;

interface Sample {
  cpu: number; // 佔單核的百分比
  memPct: number; // 記憶體用量佔上限
  fps: number | null; // 伺服器 FPS(需 REST API)
}

/**
 * 效能分析:把原本擠在總覽的資源用量獨立成一頁,加上走勢圖與更多指標。
 * 系統資源(CPU/記憶體/行程/運行時間)來自 agent;伺服器 FPS 與影格時間來自
 * PalDefender/官方 REST API。遊戲天數、據點數等世界統計不在這裡,留在玩家分頁。
 */
export function PerformanceTab({
  client,
  instanceId,
  running,
}: {
  client: AgentClient;
  instanceId: string;
  running: boolean;
}) {
  const [stats, setStats] = useState<InstanceStats | null>(null);
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const liveMiss = useRef(0);

  useEffect(() => {
    if (!running) {
      setStats(null);
      setLive(null);
      setHistory([]);
      return;
    }
    let alive = true;
    const poll = async () => {
      const [s, l] = await Promise.all([
        client.stats(instanceId).catch(() => null),
        // REST 未啟用時 live() 會拋錯,別讓它拖垮輪詢。
        liveMiss.current < 3 ? client.live(instanceId).catch(() => null) : Promise.resolve(null),
      ]);
      if (!alive) return;
      setStats(s);
      if (l) {
        setLive(l);
        liveMiss.current = l.metrics ? 0 : liveMiss.current + 1;
      }
      const fps = l?.metrics?.serverfps ?? null;
      if (s) {
        setHistory((prev) =>
          [
            ...prev,
            {
              cpu: s.cpuPercent,
              memPct: s.memoryLimitBytes ? s.memoryBytes / s.memoryLimitBytes : 0,
              fps,
            },
          ].slice(-HISTORY),
        );
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client, instanceId, running]);

  if (!running) {
    return (
      <div className="rounded-(--radius-cute) border-2 border-dashed border-line px-6 py-12 text-center text-ink-muted">
        <FiActivity className="mx-auto mb-2 size-11" />
        <p className="text-[13px]">伺服器未在運作中,啟動後即可看到即時效能。</p>
      </div>
    );
  }

  const metrics = live?.metrics ?? null;
  const cores = stats?.cpuCores ?? 1;
  const cpuOfTotal = stats ? stats.cpuPercent / (cores * 100) : 0; // 佔總算力

  return (
    <div className="flex flex-col gap-4">
      {/* 概要數字磚 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<FiCpu className="size-4" />}
          label="CPU"
          value={stats ? `${stats.cpuPercent.toFixed(0)}%` : "—"}
          sub={stats ? `共 ${cores} 核 · 佔總算力 ${(cpuOfTotal * 100).toFixed(0)}%` : undefined}
        />
        <Stat
          icon={<FiHardDrive className="size-4" />}
          label="記憶體"
          value={stats ? fmtBytes(stats.memoryBytes) : "—"}
          sub={stats ? `／ ${fmtBytes(stats.memoryLimitBytes)}` : undefined}
        />
        <Stat
          icon={<FiZap className="size-4" />}
          label="伺服器 FPS"
          value={metrics ? String(metrics.serverfps) : "—"}
          sub={metrics ? `影格 ${metrics.serverframetime.toFixed(1)} ms` : "需啟用 REST API"}
        />
        <Stat
          icon={<FiClock className="size-4" />}
          label="運行時間"
          value={stats?.uptimeSeconds != null ? fmtDuration(stats.uptimeSeconds) : "—"}
          sub={stats?.processCount != null ? `${stats.processCount} 個行程` : undefined}
        />
      </div>

      {/* 詳細用量條 */}
      <div className={`${card} flex flex-col gap-4`}>
        <h3 className="inline-flex items-center gap-2 text-sm font-extrabold">
          <FiActivity className="size-4 text-pal" /> 資源用量
        </h3>
        {stats ? (
          <>
            <Meter
              label="CPU（佔總算力）"
              text={`${(cpuOfTotal * 100).toFixed(1)}%`}
              ratio={Math.min(cpuOfTotal, 1)}
            />
            <Meter
              label="記憶體"
              text={`${fmtBytes(stats.memoryBytes)} / ${fmtBytes(stats.memoryLimitBytes)}`}
              ratio={stats.memoryLimitBytes ? stats.memoryBytes / stats.memoryLimitBytes : 0}
            />
          </>
        ) : (
          <p className="text-sm text-ink-muted">讀取中…</p>
        )}
      </div>

      {/* 走勢圖 */}
      <div className={`${card} flex flex-col gap-4`}>
        <h3 className="inline-flex items-center gap-2 text-sm font-extrabold">
          <FiActivity className="size-4 text-pal" /> 即時走勢
          <span className="text-xs font-normal text-ink-muted">(最近約 5 分鐘)</span>
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Trend
            title="CPU 佔總算力"
            unit="%"
            color="#F4A64D"
            values={history.map((h) => h.cpu / (cores * 100) * 100)}
            max={100}
          />
          <Trend
            title="記憶體使用率"
            unit="%"
            color="#7BB0E8"
            values={history.map((h) => h.memPct * 100)}
            max={100}
          />
          {metrics && (
            <Trend
              title="伺服器 FPS"
              unit=""
              color="#8FCf8F"
              values={history.map((h) => h.fps ?? 0)}
              max={Math.max(60, ...history.map((h) => h.fps ?? 0))}
            />
          )}
        </div>
        {history.length < 2 && <p className="text-xs text-ink-muted">收集資料中,稍待幾秒走勢就會出現。</p>}
      </div>

      {metrics && (
        <div className={`${card} flex flex-col gap-3`}>
          <h3 className="inline-flex items-center gap-2 text-sm font-extrabold">
            <FiLayers className="size-4 text-pal" /> 伺服器效能
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Row k="伺服器 FPS" v={String(metrics.serverfps)} />
            <Row k="影格時間" v={`${metrics.serverframetime.toFixed(1)} ms`} />
            <Row k="伺服器運行" v={fmtDuration(metrics.uptime)} />
          </dl>
          <p className="text-xs text-ink-muted">
            伺服器 FPS 越接近設定的目標越流暢;明顯偏低代表 CPU 吃緊,可到「引擎微調」分頁調整。
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className={`${card} flex flex-col gap-1`}>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted">
        {icon}
        {label}
      </span>
      <span className="text-2xl font-extrabold">{value}</span>
      {sub && <span className="text-xs text-ink-muted">{sub}</span>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="font-bold">{v}</dd>
    </div>
  );
}

function Meter({ label, text, ratio }: { label: string; text: string; ratio: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="font-bold">{text}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-card-soft">
        <div className="h-full rounded-full bg-pal transition-all" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/** 極簡 SVG 折線走勢圖 —— 用累積的取樣點畫出趨勢。 */
function Trend({
  title,
  unit,
  color,
  values,
  max,
}: {
  title: string;
  unit: string;
  color: string;
  values: number[];
  max: number;
}) {
  const W = 260;
  const H = 64;
  const last = values.length ? values[values.length - 1] : 0;
  const safeMax = max > 0 ? max : 1;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * W : 0;
    const y = H - Math.min(v / safeMax, 1) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = values.length > 1 ? `0,${H} ${pts.join(" ")} ${W},${H}` : "";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-bold text-ink-muted">{title}</span>
        <span className="text-sm font-extrabold" style={{ color }}>
          {last.toFixed(unit === "%" ? 0 : 0)}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
        {values.length > 1 && (
          <>
            <polygon points={area} fill={color} opacity="0.12" />
            <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

function fmtBytes(n: number): string {
  return n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : `${Math.round(n / (1 << 20))} MB`;
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 時`;
  if (h > 0) return `${h} 時 ${m} 分`;
  if (m > 0) return `${m} 分`;
  return `${s} 秒`;
}
