import type { InstanceStats, InstanceStatus, LogSource, LogSourceId } from "@palserver/shared";
import type { InstanceRecord } from "./store.js";

/** Per-instance paths the agent owns on disk. */
export interface DriverContext {
  /** <data-dir>/instances/<id> — config renders, logs, pid files, auto-installs. */
  instanceDir: string;
}

/**
 * A backend that knows how to run a PalServer for an instance.
 * Implementations: native (spawn the server binary on the host — default)
 * and docker (run it in a container).
 */
export interface ServerDriver {
  status(rec: InstanceRecord, ctx: DriverContext): Promise<{ status: InstanceStatus; runtimeId: string | null }>;
  /** Prepare (install if needed), apply settings, and start the server.
   * Resolves true when a start was actually initiated (spawn or background
   * install+spawn); false when it no-opped because the instance was already
   * running/installing — callers must not report a restart as done on false. */
  start(rec: InstanceRecord, ctx: DriverContext): Promise<boolean>;
  stop(rec: InstanceRecord, ctx: DriverContext): Promise<void>;
  /** Tear down runtime state (container / process). Never deletes saves. */
  remove(rec: InstanceRecord, ctx: DriverContext): Promise<void>;
  stats(rec: InstanceRecord, ctx: DriverContext): Promise<InstanceStats | null>;
  /** Follow logs line by line; resolves to a cleanup fn.
   * `replay` = how many existing trailing lines to emit on attach (default 200,
   * for the UI). Background consumers that only want *new* lines (e.g. the
   * webhook log-event tracker) pass 0 so old events aren't re-fired. */
  streamLogs(
    rec: InstanceRecord,
    ctx: DriverContext,
    onLine: (line: string) => void,
    onEnd: () => void,
    source?: LogSourceId,
    replay?: number,
  ): Promise<() => void>;

  /** Which log streams this instance can serve. */
  logSources(rec: InstanceRecord, ctx: DriverContext): LogSource[];
}
