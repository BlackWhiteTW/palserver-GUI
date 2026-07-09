import type { FastifyInstance } from "fastify";
import {
  COMMANDS,
  CreateInstanceSchema,
  UpdateSettingsSchema,
  WorldSettingsSchema,
  type AgentInfo,
  type InstanceDetail,
  type InstanceSummary,
  type RconCommandsResponse,
} from "@palserver/shared";
import { fetchServerCommands, rconExec, requireRcon } from "./rcon.js";
import type { PresenceTracker } from "./presence.js";
import type { BackupScheduler } from "./backup-scheduler.js";
import type { RestartSupervisor } from "./supervisor.js";
import { AGENT_VERSION } from "./env.js";
import type { InstanceStore, InstanceRecord } from "./store.js";
import type { DriverContext, ServerDriver } from "./driver.js";
import * as dockerOps from "./docker.js";
import { nativeDriver } from "./native.js";
import { getModsStatus, installComponent, setLuaModEnabled } from "./mods.js";
import { getLiveStatus, rest } from "./restapi.js";
import * as files from "./files.js";
import * as saves from "./saves.js";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

const drivers: Record<InstanceRecord["backend"], ServerDriver> = {
  native: nativeDriver,
  docker: dockerOps.dockerDriver,
};

export function registerRoutes(
  app: FastifyInstance,
  store: InstanceStore,
  presence: PresenceTracker,
  scheduler: BackupScheduler,
  supervisor: RestartSupervisor,
): void {
  const ctxOf = (rec: InstanceRecord): DriverContext => ({
    instanceDir: store.instanceDir(rec.id),
  });
  const driverOf = (rec: InstanceRecord) => drivers[rec.backend];

  const toSummary = async (rec: InstanceRecord): Promise<InstanceSummary> => {
    const { status } = await driverOf(rec).status(rec, ctxOf(rec));
    return {
      id: rec.id,
      name: rec.name,
      backend: rec.backend,
      flavor: rec.flavor,
      gamePort: rec.gamePort,
      status,
      createdAt: rec.createdAt,
    };
  };

  const getOr404 = (id: string): InstanceRecord => {
    const rec = store.get(id);
    if (!rec) {
      const err = new Error("instance not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return rec;
  };

  app.get("/api/info", async (): Promise<AgentInfo> => {
    const dockerVersion = await dockerOps.docker
      .version()
      .then((v) => v.Version)
      .catch(() => "unavailable");
    return {
      name: "palserver-agent",
      version: AGENT_VERSION,
      dockerVersion,
      instanceCount: store.list().length,
    };
  });

  app.get("/api/instances", async (): Promise<InstanceSummary[]> => {
    return Promise.all(store.list().map(toSummary));
  });

  app.post("/api/instances", async (req, reply) => {
    const input = CreateInstanceSchema.parse(req.body);
    if (store.findByName(input.name)) {
      return reply.code(409).send({ error: `instance "${input.name}" already exists` });
    }
    const portTaken = store.list().some((r) => r.gamePort === input.gamePort);
    if (portTaken) {
      return reply.code(409).send({ error: `game port ${input.gamePort} already in use` });
    }
    const settings = WorldSettingsSchema.parse({
      ServerName: input.name,
      PublicPort: input.gamePort,
      ...input.settings,
    });
    const rec = store.create({
      name: input.name,
      backend: input.backend,
      flavor: input.flavor,
      gamePort: input.gamePort,
      serverDir: input.serverDir,
      settings,
    });
    if (rec.backend === "docker") {
      dockerOps.writeConfig(store.instanceDir(rec.id), settings);
    }
    reply.code(201);
    return toSummary(rec);
  });

  app.get("/api/instances/:id", async (req): Promise<InstanceDetail> => {
    const rec = getOr404((req.params as { id: string }).id);
    const { status, runtimeId } = await driverOf(rec).status(rec, ctxOf(rec));
    return {
      ...(await toSummary(rec)),
      status,
      runtimeId,
      serverDir: rec.serverDir ?? null,
      settings: rec.settings,
    };
  });

  app.put("/api/instances/:id/settings", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const patch = UpdateSettingsSchema.parse(req.body);
    const updated = store.update(rec.id, {
      settings: WorldSettingsSchema.parse({ ...rec.settings, ...patch }),
    });
    // The driver re-renders the ini on every start; pre-render for docker so
    // the bind-mounted config is already in place.
    if (rec.backend === "docker") {
      dockerOps.writeConfig(store.instanceDir(rec.id), updated.settings);
    }
    return { applied: "on-next-restart", settings: updated.settings };
  });

  app.post("/api/instances/:id/start", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    await driverOf(rec).start(rec, ctxOf(rec));
    supervisor.noteManualState(rec.id, true);
    return toSummary(rec);
  });

  app.post("/api/instances/:id/stop", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    await driverOf(rec).stop(rec, ctxOf(rec));
    presence.markAllOffline(rec.id);
    // A deliberate stop must not look like a crash to the supervisor.
    supervisor.noteManualState(rec.id, false);
    return toSummary(rec);
  });

  app.post("/api/instances/:id/restart", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    await driverOf(rec).stop(rec, ctxOf(rec));
    presence.markAllOffline(rec.id);
    await driverOf(rec).start(rec, ctxOf(rec));
    supervisor.noteManualState(rec.id, true);
    return toSummary(rec);
  });

  app.delete("/api/instances/:id", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    await driverOf(rec).remove(rec, ctxOf(rec));
    store.remove(rec.id);
    // World saves under the instance/server dir are kept on disk deliberately;
    // deleting them should be an explicit, separate action.
    reply.code(204);
  });

  app.get("/api/instances/:id/stats", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const stats = await driverOf(rec).stats(rec, ctxOf(rec));
    if (!stats) return reply.code(409).send({ error: "server not running" });
    return stats;
  });

  app.get("/api/instances/:id/mods", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    return getModsStatus(rec, ctxOf(rec));
  });

  app.post("/api/instances/:id/mods/:component/install", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const component = z
      .enum(["ue4ss", "paldefender"])
      .parse((req.params as { component: string }).component);
    const { version } = await installComponent(rec, ctxOf(rec), component);
    return { installed: component, version, applied: "on-next-restart" };
  });

  app.post("/api/instances/:id/mods/lua-toggle", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const body = z.object({ name: z.string(), enabled: z.boolean() }).parse(req.body);
    setLuaModEnabled(rec, ctxOf(rec), body.name, body.enabled);
    return getModsStatus(rec, ctxOf(rec));
  });

  // ── live server control via the game's own REST API ──
  app.get("/api/instances/:id/live", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    return getLiveStatus(rec);
  });

  app.get("/api/instances/:id/players/known", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    return presence.knownPlayers(rec.id);
  });

  app.get("/api/instances/:id/players/events", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
      .parse(req.query);
    return presence.events(rec.id, limit);
  });

  app.post("/api/instances/:id/announce", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { message } = z.object({ message: z.string().min(1).max(500) }).parse(req.body);
    await rest.announce(rec, message);
    return { announced: message };
  });

  app.post("/api/instances/:id/players/:userId/kick", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { userId } = req.params as { userId: string };
    const { message } = z.object({ message: z.string().max(500).optional() }).parse(req.body ?? {});
    await rest.kick(rec, userId, message);
    return { kicked: userId };
  });

  app.post("/api/instances/:id/players/:userId/ban", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { userId } = req.params as { userId: string };
    const { message } = z.object({ message: z.string().max(500).optional() }).parse(req.body ?? {});
    await rest.ban(rec, userId, message);
    return { banned: userId };
  });

  app.post("/api/instances/:id/players/:userId/unban", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { userId } = req.params as { userId: string };
    await rest.unban(rec, userId);
    return { unbanned: userId };
  });

  app.post("/api/instances/:id/save", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    await rest.save(rec);
    return { saved: true };
  });

  const LogSourceSchema = z.enum(["agent", "game", "paldefender"]);

  // ── RCON console ──
  app.get("/api/instances/:id/rcon/commands", async (req): Promise<RconCommandsResponse> => {
    const rec = getOr404((req.params as { id: string }).id);
    try {
      requireRcon(rec);
    } catch (err) {
      return {
        available: false,
        reason: err instanceof Error ? err.message : String(err),
        paldefender: false,
        commands: [],
      };
    }
    const hasPalDefender = getModsStatus(rec, ctxOf(rec)).paldefender.installed;
    // PalDefender knows exactly which commands this build accepts; prefer it
    // over our static list so plugin updates don't strand the UI.
    const live = hasPalDefender ? await fetchServerCommands(rec) : null;
    const commands = COMMANDS.filter((c) => {
      if (c.source === "builtin") return true;
      if (!hasPalDefender) return false;
      return live ? live.includes(c.name) : true;
    });
    return { available: true, paldefender: hasPalDefender, commands };
  });

  app.post("/api/instances/:id/rcon", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { command } = z.object({ command: z.string().min(1).max(500) }).parse(req.body);
    const output = await rconExec(rec, command);
    return { command, output };
  });

  // ── automatic restarts ──
  app.get("/api/instances/:id/restart-policy", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const ctx = ctxOf(rec);
    const stats = rec.backend === "native" ? await driverOf(rec).stats(rec, ctx) : null;
    return {
      supported: rec.backend === "native",
      reason: rec.backend === "native" ? undefined : "自動重啟目前僅支援原生模式的實例",
      policy: supervisor.readPolicy(rec.id),
      events: supervisor.events(rec.id),
      restartsLastHour: supervisor.restartsLastHour(rec.id),
      memoryMB: stats ? Math.round(stats.memoryBytes / (1 << 20)) : null,
    };
  });

  app.put("/api/instances/:id/restart-policy", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時間格式須為 HH:MM");
    const policy = z
      .object({
        scheduled: z.object({
          enabled: z.boolean(),
          mode: z.enum(["interval", "daily"]),
          intervalMinutes: z.number().int().min(15).max(10080),
          dailyTimes: z.array(HHMM).max(12),
        }),
        memory: z.object({
          enabled: z.boolean(),
          thresholdMB: z.number().int().min(512).max(262144),
          sustainedChecks: z.number().int().min(1).max(20),
        }),
        crash: z.object({
          enabled: z.boolean(),
          maxPerHour: z.number().int().min(1).max(20),
        }),
        announceSeconds: z.number().int().min(0).max(300),
      })
      .parse(req.body);
    return supervisor.writePolicy(rec.id, policy);
  });

  // ── world saves & backups ──
  const isRunning = async (rec: InstanceRecord) =>
    (await driverOf(rec).status(rec, ctxOf(rec))).status === "running";

  app.get("/api/instances/:id/saves", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    return { ...saves.getSavesStatus(rec, ctxOf(rec)), schedule: scheduler.read(rec.id) };
  });

  app.put("/api/instances/:id/saves/schedule", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const patch = z
      .object({
        enabled: z.boolean().optional(),
        intervalMinutes: z.number().int().min(5).max(1440).optional(),
        keep: z.number().int().min(1).max(100).optional(),
        skipWhenEmpty: z.boolean().optional(),
      })
      .parse(req.body);
    return scheduler.update(rec.id, patch);
  });

  /** Run the scheduled backup right now (same code path as the timer). */
  app.post("/api/instances/:id/saves/schedule/run", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    return scheduler.runFor(rec);
  });

  app.post("/api/instances/:id/saves/backup", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { worldGuid } = z.object({ worldGuid: z.string().min(1).max(64) }).parse(req.body);
    reply.code(201);
    return saves.createBackup(rec, ctxOf(rec), worldGuid);
  });

  app.post("/api/instances/:id/saves/restore", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { backup } = z.object({ backup: z.string().min(1).max(200) }).parse(req.body);
    return saves.restoreBackup(rec, ctxOf(rec), backup, await isRunning(rec));
  });

  app.delete("/api/instances/:id/saves/backup", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { name } = z.object({ name: z.string().min(1).max(200) }).parse(req.query);
    saves.deleteBackup(ctxOf(rec), name);
    reply.code(204);
  });

  app.get("/api/instances/:id/saves/backup/download", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { name } = z.object({ name: z.string().min(1).max(200) }).parse(req.query);
    const file = saves.backupPath(ctxOf(rec), name);
    reply.header("content-type", "application/gzip");
    reply.header("content-disposition", `attachment; filename="${path.basename(file)}"`);
    return fs.createReadStream(file);
  });

  app.post("/api/instances/:id/saves/active", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { worldGuid } = z.object({ worldGuid: z.string().min(1).max(64) }).parse(req.body);
    if (await isRunning(rec)) {
      throw Object.assign(new Error("請先停止伺服器再切換世界"), { statusCode: 409 });
    }
    saves.setActiveWorldGuid(saves.serverRootOf(rec, ctxOf(rec)), worldGuid);
    return { active: worldGuid, applied: "on-next-start" };
  });

  app.delete("/api/instances/:id/saves/player", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { worldGuid, file } = z
      .object({ worldGuid: z.string().min(1).max(64), file: z.string().min(1).max(100) })
      .parse(req.query);
    saves.deletePlayerSave(rec, ctxOf(rec), worldGuid, file, await isRunning(rec));
    reply.code(204);
  });

  // ── file browser (native instances; confined to the server directory) ──
  const PathQuery = z.object({ path: z.string().max(500).default("") });

  app.get("/api/instances/:id/files", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { path: rel } = PathQuery.parse(req.query);
    return { path: rel, entries: files.listDir(files.fileRoot(rec, ctxOf(rec)), rel) };
  });

  app.get("/api/instances/:id/files/content", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { path: rel } = PathQuery.parse(req.query);
    return files.readFile(files.fileRoot(rec, ctxOf(rec)), rel);
  });

  app.put("/api/instances/:id/files/content", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    const body = z.object({ path: z.string().max(500), content: z.string() }).parse(req.body);
    files.writeFile(files.fileRoot(rec, ctxOf(rec)), body.path, body.content);
    return { saved: body.path, applied: "on-next-restart" };
  });

  app.post("/api/instances/:id/files/dir", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const body = z.object({ path: z.string().min(1).max(500) }).parse(req.body);
    files.makeDir(files.fileRoot(rec, ctxOf(rec)), body.path);
    reply.code(201);
    return { created: body.path };
  });

  app.delete("/api/instances/:id/files", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { path: rel } = z.object({ path: z.string().min(1).max(500) }).parse(req.query);
    files.deletePath(files.fileRoot(rec, ctxOf(rec)), rel);
    reply.code(204);
  });

  // Raw body upload: `PUT /files/upload?path=Mods/foo.pak` with the file bytes.
  // Streamed to disk so multi-hundred-MB pak mods don't buffer in memory.
  app.put("/api/instances/:id/files/upload", async (req, reply) => {
    const rec = getOr404((req.params as { id: string }).id);
    const { path: rel } = z.object({ path: z.string().min(1).max(500) }).parse(req.query);
    const target = files.uploadTarget(files.fileRoot(rec, ctxOf(rec)), rel);
    await pipeline(req.raw, fs.createWriteStream(target));
    reply.code(201);
    return { uploaded: rel, size: fs.statSync(target).size };
  });

  app.get("/api/instances/:id/logs/sources", async (req) => {
    const rec = getOr404((req.params as { id: string }).id);
    return driverOf(rec).logSources(rec, ctxOf(rec));
  });

  app.get("/api/instances/:id/logs", { websocket: true }, (socket, req) => {
    const rec = store.get((req.params as { id: string }).id);
    if (!rec) {
      socket.close(4004, "instance not found");
      return;
    }
    const source = LogSourceSchema.catch("agent").parse(
      (req.query as { source?: string }).source,
    );
    let cleanup: (() => void) | null = null;
    driverOf(rec)
      .streamLogs(
        rec,
        ctxOf(rec),
        (line) => socket.send(line),
        () => socket.close(1000, "log stream ended"),
        source,
      )
      .then((stop) => {
        cleanup = stop;
        if (socket.readyState !== socket.OPEN) stop();
      })
      .catch((err: Error) => socket.close(1011, err.message.slice(0, 120)));
    socket.on("close", () => cleanup?.());
  });
}
