import { finishJobRun, startJobRun, type Queryable } from "@signal/shared/db";
import type { PgBoss } from "pg-boss";

export interface JobContext {
  db: Queryable;
  jobId: string;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  signal: AbortSignal;
}

export interface JobDefinition<T extends object = object> {
  name: string;
  /** Cron (UTC). Omit for queue-only jobs. */
  cron?: string;
  /** Run once when the worker boots. */
  runOnBoot?: boolean;
  retryLimit?: number;
  expireInSeconds?: number;
  handler: (data: T, ctx: JobContext) => Promise<Record<string, unknown>>;
}

export function defineJob<T extends object>(def: JobDefinition<T>): JobDefinition<T> {
  return def;
}

const log = (job: string) => (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), job, msg, ...extra }));

/**
 * Registers a job with pg-boss. Each execution is recorded in public.job_runs with stats or the
 * error. A failing job is logged and retried by pg-boss with exponential backoff; it never crashes
 * the worker process.
 */
export async function registerJob(boss: PgBoss, db: Queryable, def: JobDefinition<object>): Promise<void> {
  await boss.createQueue(def.name, {
    retryLimit: def.retryLimit ?? 3,
    retryDelay: 30,
    retryBackoff: true,
    retryDelayMax: 3600,
    expireInSeconds: def.expireInSeconds ?? 15 * 60,
  });

  await boss.work<object>(def.name, async (jobs) => {
    for (const job of jobs) {
      const l = log(def.name);
      let runId: number | null = null;
      try {
        runId = await startJobRun(db, def.name, job.id);
      } catch (err) {
        l("could not write job_runs row", { error: String(err) });
      }
      const started = Date.now();
      try {
        const stats = await def.handler(job.data ?? {}, { db, jobId: job.id, log: l, signal: job.signal });
        if (runId !== null) await finishJobRun(db, runId, { status: "succeeded", stats: { ...stats, ms: Date.now() - started } });
        l("succeeded", { ms: Date.now() - started });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        l("failed", { error: message, attempt: job.retryCount });
        if (runId !== null) await finishJobRun(db, runId, { status: "failed", error: message, stats: { ms: Date.now() - started } }).catch(() => undefined);
        throw err; // let pg-boss schedule the retry
      }
    }
  });

  if (def.cron) await boss.schedule(def.name, def.cron, {}, { tz: "UTC" });
  if (def.runOnBoot) await boss.send(def.name, {}, { singletonKey: `${def.name}:boot`, singletonSeconds: 60 });
}
