import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { DATA_DIR } from "./env.js";

/**
 * 配置評估健檢(進階顯示/贊助者):收集這台主機的硬體與網路狀況,
 * 用「開帕魯專用伺服器」的需求給逐項評級與總分。
 *
 * 設計原則:
 * - 規則評分完全在本機完成(離線可用,不外送任何資料)。
 * - 磁碟不猜 SSD/HDD 型號,直接實測寫入速度(64MB 到 DATA_DIR,存檔就住這顆碟)。
 * - 網路量不到玩家到主機的 UDP 品質,用對外 TCP 連線 RTT/抖動當代理指標,誠實標示。
 */

export type Rating = "good" | "ok" | "poor";

export interface SystemSpecs {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  /** os.cpus() 回報的時脈(MHz);部分平台拿不到就是 0。 */
  cpuSpeedMHz: number;
  ramTotalBytes: number;
  ramFreeBytes: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
  /** 實測循序寫入(MB/s),寫在 DATA_DIR 所在磁碟。 */
  diskWriteMBps: number;
  /** 對外 TCP 443 連線 RTT(ms):取多個端點多次採樣。 */
  netAvgMs: number | null;
  netMinMs: number | null;
  /** RTT 抖動(樣本標準差,ms)。 */
  netJitterMs: number | null;
}

export interface DimensionReview {
  rating: Rating;
  /** 前端顯示用的主要數值(已格式化交給前端做,這裡給原始)。 */
  score: number;
}

export interface SystemReview {
  specs: SystemSpecs;
  ram: DimensionReview;
  cpu: DimensionReview;
  disk: DimensionReview;
  network: DimensionReview;
  /** 0–100 加權總分。 */
  overall: number;
  generatedAt: string;
}

/** 實測循序寫入速度:64MB 寫進 DATA_DIR 再刪掉。存檔與伺服器檔案就住這顆碟,
 *  比猜磁碟型號誠實;HDD 通常 <150MB/s、SATA SSD ~300-500、NVMe >1000。 */
async function measureDiskWrite(): Promise<number> {
  const file = path.join(DATA_DIR, `.disk-bench-${crypto.randomBytes(4).toString("hex")}`);
  const chunk = crypto.randomBytes(4 * 1024 * 1024); // 4MB 亂數塊,避開壓縮/快取美化
  const chunks = 16; // 共 64MB
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const started = process.hrtime.bigint();
    const fd = fs.openSync(file, "w");
    for (let i = 0; i < chunks; i++) fs.writeSync(fd, chunk);
    fs.fsyncSync(fd); // 逼出 OS 寫入快取,量到的才是磁碟
    fs.closeSync(fd);
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    return Math.round(((chunks * chunk.length) / (1 << 20)) / seconds);
  } catch {
    return 0;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** 一次 TCP 連線的 RTT(ms);逾時/失敗回 null。 */
function tcpRtt(host: string, port: number, timeoutMs = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const sock = net.connect({ host, port });
    const done = (v: number | null) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeoutMs, () => done(null));
    sock.once("connect", () => done(Number(process.hrtime.bigint() - started) / 1e6));
    sock.once("error", () => done(null));
  });
}

/** 對外連線品質:兩個端點各 4 次採樣(丟掉第一次的 DNS/暖機失真)。 */
async function measureNetwork(): Promise<{ avg: number | null; min: number | null; jitter: number | null }> {
  const hosts: [string, number][] = [
    ["api.steampowered.com", 443], // 與遊戲生態相關的實際端點
    ["www.google.com", 443],
  ];
  const samples: number[] = [];
  for (const [host, port] of hosts) {
    await tcpRtt(host, port); // 暖機(DNS/連線快取),不計入
    for (let i = 0; i < 4; i++) {
      const v = await tcpRtt(host, port);
      if (v !== null) samples.push(v);
    }
  }
  if (samples.length === 0) return { avg: null, min: null, jitter: null };
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const jitter = Math.sqrt(samples.reduce((a, b) => a + (b - avg) ** 2, 0) / samples.length);
  return { avg: Math.round(avg * 10) / 10, min: Math.round(min * 10) / 10, jitter: Math.round(jitter * 10) / 10 };
}

export async function collectSpecs(): Promise<SystemSpecs> {
  const cpus = os.cpus();
  let diskTotal = 0;
  let diskFree = 0;
  try {
    const st = fs.statfsSync(DATA_DIR);
    diskTotal = st.blocks * st.bsize;
    diskFree = st.bavail * st.bsize;
  } catch {
    /* 平台不支援 statfs 就留 0,前端顯示 — */
  }
  const [diskWriteMBps, netStats] = await Promise.all([measureDiskWrite(), measureNetwork()]);
  return {
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0]?.model?.trim() ?? "unknown",
    cpuCores: cpus.length,
    cpuSpeedMHz: cpus[0]?.speed ?? 0,
    ramTotalBytes: os.totalmem(),
    ramFreeBytes: os.freemem(),
    diskTotalBytes: diskTotal,
    diskFreeBytes: diskFree,
    diskWriteMBps,
    netAvgMs: netStats.avg,
    netMinMs: netStats.min,
    netJitterMs: netStats.jitter,
  };
}

const RATING_SCORE: Record<Rating, number> = { good: 100, ok: 60, poor: 25 };

/** 規則評分:門檻依帕魯專用伺服器的實際需求(RAM 吃最兇,單核時脈次之)。 */
export function reviewSpecs(specs: SystemSpecs): SystemReview {
  const gb = (n: number) => n / (1 << 30);

  // RAM:官方建議 16GB 起,實際 8-10 人以上/大量據點會吃到 16-24GB
  const ramRating: Rating = gb(specs.ramTotalBytes) >= 31 ? "good" : gb(specs.ramTotalBytes) >= 15 ? "ok" : "poor";
  // CPU:tick 主要吃單核;核心數留給遊戲+系統+GUI
  const cpuRating: Rating =
    specs.cpuCores >= 8 && (specs.cpuSpeedMHz === 0 || specs.cpuSpeedMHz >= 3000)
      ? "good"
      : specs.cpuCores >= 4
        ? "ok"
        : "poor";
  // 磁碟:自動備份/存檔寫入吃循序寫;剩餘空間要放得下伺服器(~20GB)+備份
  const diskSpeedRating: Rating = specs.diskWriteMBps >= 300 ? "good" : specs.diskWriteMBps >= 100 ? "ok" : "poor";
  const diskSpaceRating: Rating = gb(specs.diskFreeBytes) >= 60 ? "good" : gb(specs.diskFreeBytes) >= 25 ? "ok" : "poor";
  const diskRating: Rating = [diskSpeedRating, diskSpaceRating].includes("poor")
    ? "poor"
    : [diskSpeedRating, diskSpaceRating].includes("ok")
      ? "ok"
      : "good";
  // 網路:對外 RTT/抖動當代理;量不到(離線/防火牆)算 ok 不懲罰
  const netRating: Rating =
    specs.netAvgMs === null
      ? "ok"
      : specs.netAvgMs <= 45 && (specs.netJitterMs ?? 0) <= 20
        ? "good"
        : specs.netAvgMs <= 110 && (specs.netJitterMs ?? 0) <= 50
          ? "ok"
          : "poor";

  const overall = Math.round(
    RATING_SCORE[ramRating] * 0.35 +
      RATING_SCORE[cpuRating] * 0.3 +
      RATING_SCORE[diskRating] * 0.2 +
      RATING_SCORE[netRating] * 0.15,
  );

  return {
    specs,
    ram: { rating: ramRating, score: RATING_SCORE[ramRating] },
    cpu: { rating: cpuRating, score: RATING_SCORE[cpuRating] },
    disk: { rating: diskRating, score: RATING_SCORE[diskRating] },
    network: { rating: netRating, score: RATING_SCORE[netRating] },
    overall,
    generatedAt: new Date().toISOString(),
  };
}
