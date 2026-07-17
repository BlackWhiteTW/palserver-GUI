import type { BanEntry, ModerationLists, WhitelistEntry } from "@palserver/shared";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverPlatform } from "./platform.js";
import { getPdDir } from "./paldefender-rest.js";
import * as dockerOps from "./docker.js";
import { execInPod } from "./k8s-files.js";
import { rconExec } from "./rcon.js";

/**
 * PalDefender whitelist & banlist.
 *
 * Reads are file-based (WhiteList.json / Banlist.json / Config.json) so the
 * lists show even when the server is offline. Mutations go through RCON —
 * PalDefender's docs say not to hand-edit Banlist.json, and RCON keeps the
 * plugin's in-memory state in sync. So this module reads; the routes issue
 * the whitelist_add / ban / banip / unban commands.
 *
 * All reads go through exec for docker/k8s (container/Pod filesystem).
 */

const looksLikeIp = (s: string) => /^\d{1,3}(\.\d{1,3}){3}(\/\d+)?$/.test(s.trim());

async function readJsonInRuntime<T>(rec: InstanceRecord, file: string): Promise<T | null> {
  let raw: string | null;
  if (rec.backend === "native") {
    const fs = await import("node:fs");
    try { raw = fs.readFileSync(file, "utf8"); } catch { return null; }
  } else if (rec.backend === "docker") {
    try { raw = await dockerOps.execInContainer(rec, ["cat", file]); } catch { return null; }
  } else {
    try { raw = await execInPod(rec, ["cat", file]); } catch { return null; }
  }
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** WhiteList.json is an array of strings (UserIds and/or IPs). */
function parseWhitelist(raw: unknown): WhitelistEntry[] {
  const values: string[] = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : Array.isArray((raw as { whitelist?: string[] })?.whitelist)
      ? (raw as { whitelist: string[] }).whitelist
      : [];
  return values.map((value) => ({ value, isIp: looksLikeIp(value) }));
}

/** Banlist.json shape varies by version; accept the common forms. */
function parseBanlist(raw: unknown): BanEntry[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { bans?: unknown[] })?.bans)
      ? (raw as { bans: unknown[] }).bans
      : raw && typeof raw === "object"
        ? Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({ userId: k, ...(v as object) }))
        : [];
  return list.map((item): BanEntry => {
    if (typeof item === "string") {
      return looksLikeIp(item) ? { userId: null, ip: item } : { userId: item, ip: null };
    }
    const o = (item ?? {}) as Record<string, unknown>;
    const userId = (o.userId ?? o.UserId ?? o.userid ?? o.steamId ?? null) as string | null;
    const ip = (o.ip ?? o.IP ?? o.Ip ?? null) as string | null;
    const reason = (o.reason ?? o.Reason ?? undefined) as string | undefined;
    return { userId: userId || null, ip: ip || null, reason };
  });
}

export async function getModerationLists(rec: InstanceRecord, ctx: DriverContext): Promise<ModerationLists> {
  if (serverPlatform(rec) !== "windows") {
    return { supported: false, reason: "名單管理僅支援 Windows 伺服器", whitelistEnabled: false, whitelist: [], bans: [] };
  }
  const dir = await getPdDir(rec, ctx);
  if (!dir) {
    return {
      supported: false,
      reason: "尚未安裝 PalDefender,或伺服器尚未啟動過以生成設定檔",
      whitelistEnabled: false,
      whitelist: [],
      bans: [],
    };
  }
  const [wlRaw, blRaw, cfgRaw] = await Promise.all([
    readJsonInRuntime<unknown>(rec, `${dir}/WhiteList.json`),
    readJsonInRuntime<unknown>(rec, `${dir}/Banlist.json`),
    readJsonInRuntime<{ useWhitelist?: boolean }>(rec, `${dir}/Config.json`),
  ]);
  return {
    supported: true,
    whitelistEnabled: cfgRaw?.useWhitelist === true,
    whitelist: parseWhitelist(wlRaw),
    bans: parseBanlist(blRaw),
  };
}

/** RCON-backed mutations. PalDefender reloads its lists as it runs these. */
export const moderation = {
  whitelistAdd: (rec: InstanceRecord, userId: string) => rconExec(rec, `whitelist_add ${userId}`),
  whitelistRemove: (rec: InstanceRecord, userId: string) => rconExec(rec, `whitelist_remove ${userId}`),
  ban: (rec: InstanceRecord, userId: string, reason?: string) =>
    rconExec(rec, `ban ${userId}${reason ? ` ${reason}` : ""}`),
  unban: (rec: InstanceRecord, userId: string) => rconExec(rec, `unban ${userId}`),
  banIp: (rec: InstanceRecord, ip: string) => rconExec(rec, `banip ${ip}`),
  unbanIp: (rec: InstanceRecord, ip: string) => rconExec(rec, `unbanip ${ip}`),
};
