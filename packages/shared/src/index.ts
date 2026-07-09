import { z } from "zod";
import { WORLD_OPTIONS, type OptionMeta } from "./options.js";

export * from "./options.js";
export * from "./commands.js";

/** Value type an option can hold at runtime. */
export type WorldOptionValue = string | number | boolean;
export type WorldSettings = Record<keyof typeof WORLD_OPTIONS, WorldOptionValue>;

function zodFor(meta: OptionMeta): z.ZodTypeAny {
  switch (meta.type) {
    case "float":
      return z.number().min(meta.min).max(meta.max).default(meta.default);
    case "int":
      return z.number().int().min(meta.min).max(meta.max).default(meta.default);
    case "bool":
      return z.boolean().default(meta.default);
    case "enum":
      return z.enum(meta.choices as [string, ...string[]]).default(meta.default);
    case "string":
      return z.string().max(meta.maxLength).default(meta.default);
  }
}

const shape = Object.fromEntries(
  Object.entries(WORLD_OPTIONS).map(([key, meta]) => [key, zodFor(meta)]),
);

/** Full settings object; missing keys are filled with defaults on parse. */
export const WorldSettingsSchema = z.object(shape) as unknown as z.ZodType<WorldSettings>;

/** Partial patch used by PUT /instances/:id/settings. */
export const UpdateSettingsSchema = z
  .object(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.optional()])))
  .strict() as unknown as z.ZodType<Partial<WorldSettings>>;

export const InstanceStatusSchema = z.enum([
  "created", // no runtime yet (never started, or removed) — start materializes it
  "installing", // native: server files downloading; watch the logs for progress
  "running",
  "restarting",
  "exited",
  "missing",
]);
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>;

/** How the agent runs the server: native = spawn PalServer directly on the
 * host (default, no Docker needed); docker = run it in a container. */
export const BackendSchema = z.enum(["native", "docker"]);
export type Backend = z.infer<typeof BackendSchema>;

export const CreateInstanceSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes"),
  backend: BackendSchema.default("native"),
  flavor: z.enum(["vanilla", "modded"]).default("vanilla"),
  /** UDP port the server listens on (host port for docker). */
  gamePort: z.number().int().min(1024).max(65535).default(8211),
  /** native only: adopt an existing dedicated-server install instead of
   * letting the agent download one (e.g. C:\steamcmd\steamapps\common\PalServer). */
  serverDir: z.string().max(500).optional(),
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type CreateInstanceInput = z.infer<typeof CreateInstanceSchema>;

export interface InstanceSummary {
  id: string;
  name: string;
  backend: Backend;
  flavor: "vanilla" | "modded";
  gamePort: number;
  status: InstanceStatus;
  createdAt: string;
}

export interface InstanceDetail extends InstanceSummary {
  settings: WorldSettings;
  /** docker: container id · native: process id (null when not running). */
  runtimeId: string | null;
  serverDir: string | null;
}

export interface InstanceStats {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
}

/** Mod-management state for one instance (native backend only). */
export interface ModsStatus {
  /** false when the backend/platform can't manage mods (docker, non-adopted…). */
  supported: boolean;
  reason?: string;
  ue4ss: { installed: boolean; version: string | null };
  paldefender: { installed: boolean; version: string | null };
  /** UE4SS Lua mods found under the mods dir. */
  luaMods: { name: string; enabled: boolean }[];
  /** Server-dir-relative path of the Lua mods folder (layout varies by UE4SS
   * version); null when UE4SS isn't installed yet. */
  luaModsDir: string | null;
  /** .pak files under Pal/Content/Paks (excluding the game's own pak). */
  pakMods: string[];
}

export type ModComponent = "ue4ss" | "paldefender";

/** A log stream the instance can serve. `agent` is our own capture (install
 * progress + stdout); `game` is the server's UE log; `paldefender` is the
 * plugin's own rotating log. */
export type LogSourceId = "agent" | "game" | "paldefender";

export interface LogSource {
  id: LogSourceId;
  label: string;
  /** false when the underlying file/dir doesn't exist (yet). */
  available: boolean;
}

/** One entry in the instance file browser (rooted at the server dir). */
export interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  modifiedAt: string;
  /** text file, small enough to open in the editor */
  editable: boolean;
}

export interface FileContent {
  path: string;
  content: string;
}

/* ── Palworld server REST API (docs.palworldgame.com/api/rest-api) ──
 * The agent proxies these; the game's own API is never exposed to the UI. */

export interface RestPlayer {
  name: string;
  accountName: string;
  playerId: string;
  userId: string;
  ip: string;
  ping: number;
  location_x: number;
  location_y: number;
  level: number;
  building_count: number;
}

export interface RestServerInfo {
  version: string;
  servername: string;
  description: string;
  worldguid: string;
}

export interface RestMetrics {
  serverfps: number;
  currentplayernum: number;
  serverframetime: number;
  maxplayernum: number;
  uptime: number;
  basecampnum: number;
  days: number;
}

/* World-coordinate conversion. The REST API reports Unreal/save-file
 * coordinates; the in-game map uses a [-1000, 1000] square. Offsets are the
 * midpoints of the sav bounds and the scale is sav units per map unit, from
 * the game's DT_WorldMapUIData.
 *
 * Unreal's axes are X = north(+) / south(-) and Y = east(+) / west(-), so the
 * map's horizontal axis comes from sav Y and its vertical axis from sav X —
 * they are NOT parallel. Cross-checked against the world bounds:
 *   sav X -582888..335112 → map y (north) -1000..1000
 *   sav Y -301000..617000 → map x (east)  -1000..1000
 */
export const WORLD_OFFSET = { northSouth: 123888, eastWest: -158000 } as const;
export const WORLD_SCALE = 459;
export const MAP_BOUND = 1000;

/** Map coordinates as the game shows them: x grows east, y grows north. */
export function savToMap(savX: number, savY: number): { x: number; y: number } {
  return {
    x: (savY + WORLD_OFFSET.eastWest) / WORLD_SCALE,
    y: (savX + WORLD_OFFSET.northSouth) / WORLD_SCALE,
  };
}

/** A player the agent has seen at least once on this instance — the roster
 * that survives logouts, so offline targets (e.g. /unban) stay selectable. */
export interface KnownPlayer {
  userId: string;
  name: string;
  accountName: string;
  online: boolean;
  firstSeen: string;
  lastSeen: string;
  /** completed sessions (a session still in progress isn't counted yet) */
  sessions: number;
  playtimeSeconds: number;
  lastLevel: number;
}

export interface PresenceEvent {
  at: string;
  type: "join" | "leave";
  userId: string;
  name: string;
}

/** Aggregated live view; `available` is false when the server is down or
 * the REST API / admin password isn't configured. */
export interface LiveStatus {
  available: boolean;
  reason?: string;
  info: RestServerInfo | null;
  metrics: RestMetrics | null;
  players: RestPlayer[];
}

/* ── world saves & backups ── */

export interface PlayerSave {
  file: string;
  /** the .sav filename without extension — Palworld's internal PlayerUid */
  playerUid: string;
  sizeBytes: number;
}

export interface WorldSave {
  guid: string;
  /** true when GameUserSettings.ini's DedicatedServerName points here */
  active: boolean;
  sizeBytes: number;
  modifiedAt: string;
  playerSaves: PlayerSave[];
}

export interface BackupInfo {
  name: string;
  worldGuid: string;
  sizeBytes: number;
  createdAt: string;
  /** true when the server flushed the world to disk before archiving */
  flushedBeforeBackup?: boolean;
}

/** Scheduled backups of the active world, run by the agent. */
export interface BackupSchedule {
  enabled: boolean;
  /** minutes between backups */
  intervalMinutes: number;
  /** how many archives of a world to keep; older ones are pruned */
  keep: number;
  /** skip a run when nobody is online (avoids piles of identical archives) */
  skipWhenEmpty: boolean;
  lastRunAt?: string;
  lastResult?: string;
}

export const DEFAULT_BACKUP_SCHEDULE: BackupSchedule = {
  enabled: false,
  intervalMinutes: 60,
  keep: 10,
  skipWhenEmpty: true,
};

export interface SavesStatus {
  supported: boolean;
  reason?: string;
  worlds: WorldSave[];
  backups: BackupInfo[];
  schedule: BackupSchedule;
}

/* ── automatic restarts ── */

export type RestartReason = "scheduled" | "memory" | "crash" | "manual";

export interface RestartPolicy {
  /** Restart on a timer: every N minutes, or at fixed times of day. */
  scheduled: {
    enabled: boolean;
    mode: "interval" | "daily";
    intervalMinutes: number;
    /** "HH:MM" in the agent host's local time */
    dailyTimes: string[];
  };
  /** Restart when the server's memory stays above a threshold. */
  memory: {
    enabled: boolean;
    thresholdMB: number;
    /** consecutive 30s checks above the threshold before acting (ignores spikes) */
    sustainedChecks: number;
  };
  /** Bring the server back after it exits on its own. */
  crash: {
    enabled: boolean;
    /** give up (and stop retrying) beyond this many restarts in one hour */
    maxPerHour: number;
  };
  /** Warn players over the REST API before a planned restart. 0 = no warning. */
  announceSeconds: number;
}

export const DEFAULT_RESTART_POLICY: RestartPolicy = {
  scheduled: { enabled: false, mode: "interval", intervalMinutes: 360, dailyTimes: ["05:00"] },
  memory: { enabled: false, thresholdMB: 12288, sustainedChecks: 3 },
  crash: { enabled: true, maxPerHour: 5 },
  announceSeconds: 30,
};

export interface RestartEvent {
  at: string;
  reason: RestartReason;
  ok: boolean;
  detail: string;
}

export interface RestartStatus {
  supported: boolean;
  reason?: string;
  policy: RestartPolicy;
  events: RestartEvent[];
  restartsLastHour: number;
  /** current memory of the server process tree, when running */
  memoryMB: number | null;
}

export interface AgentInfo {
  name: string;
  version: string;
  dockerVersion: string;
  instanceCount: number;
}

export interface ApiError {
  error: string;
}
