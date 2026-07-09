#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { DATA_DIR, HOST, PORT, AGENT_VERSION } from "./env.js";
import { loadOrCreateToken, makeAuthHook } from "./auth.js";
import { InstanceStore } from "./store.js";
import { PresenceTracker } from "./presence.js";
import { BackupScheduler } from "./backup-scheduler.js";
import { RestartSupervisor } from "./supervisor.js";
import { nativeDriver } from "./native.js";
import { dockerDriver } from "./docker.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 1024 });
const token = loadOrCreateToken();
const store = new InstanceStore();

// File uploads stream straight to disk (see PUT /files/upload), so hand the
// raw request through instead of buffering it into a body.
app.addContentTypeParser("application/octet-stream", (_req, _payload, done) => done(null, undefined));

await app.register(cors, { origin: true });
await app.register(websocket);

// Serve the built web UI when present (packages/web/dist copied or resolved in-repo).
const webDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/dist",
);
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
}

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  if (err instanceof ZodError) {
    reply.code(400).send({ error: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") });
    return;
  }
  const status = err.statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  reply.code(status).send({ error: err.message });
});

app.addHook("onRequest", async (req, reply) => {
  if (req.url.startsWith("/api/")) {
    await makeAuthHook(token)(req, reply);
  }
});

const presence = new PresenceTracker(store);
presence.start();

const scheduler = new BackupScheduler(store, (rec) =>
  rec.backend === "native" ? nativeDriver : dockerDriver,
);
scheduler.start();

const supervisor = new RestartSupervisor(store, (rec) =>
  rec.backend === "native" ? nativeDriver : dockerDriver,
);
supervisor.start();

registerRoutes(app, store, presence, scheduler, supervisor);

await app.listen({ host: HOST, port: PORT });

app.log.info(`palserver-agent v${AGENT_VERSION}`);
app.log.info(`data dir: ${DATA_DIR}`);
app.log.info(`API token: ${token}`);
