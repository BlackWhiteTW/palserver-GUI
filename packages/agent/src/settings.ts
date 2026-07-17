import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * 可從 GUI 面板修改的 agent 設定,存 data-dir/settings.json。
 * 這些值原本只能靠環境變數設定(見 env.ts);面板寫進這個檔,agent 開機時疊上去。
 * 優先序:環境變數 > settings.json > 預設值(有設環境變數的欄位面板顯示為「鎖定」)。
 *
 * DATA_DIR 在這裡自行推算(而非 import env.ts),避免 env.ts ↔ settings.ts 循環相依。
 */
const DATA_DIR = process.env.PALSERVER_DATA_DIR
  ? path.resolve(process.env.PALSERVER_DATA_DIR)
  : path.join(os.homedir(), ".palserver-agent");
const FILE = path.join(DATA_DIR, "settings.json");

export interface AgentSettings {
  /** 強制一律要 token(即使 loopback)。 */
  requireToken?: boolean;
  /** 以 HTTPS 監聽。 */
  tls?: boolean;
  /** 監聽埠。 */
  agentPort?: number;
  /** 監聽位址。 */
  agentHost?: string;
  /** 允許的跨源公開站來源(逗號分隔字串)。 */
  webOrigins?: string;
  /** 開機時自動打開瀏覽器到管理介面(下次啟動生效)。 */
  autoOpenBrowser?: boolean;
}

export function loadSettings(): AgentSettings {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8")) as unknown;
    return j && typeof j === "object" ? (j as AgentSettings) : {};
  } catch {
    return {};
  }
}

export function saveSettings(patch: AgentSettings): AgentSettings {
  const next: AgentSettings = { ...loadSettings(), ...patch };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  } catch {
    /* 寫不進去就維持記憶體值;下次還會嘗試 */
  }
  return next;
}
