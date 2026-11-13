import { loadRootEnv } from "@signal/shared/env-file";
import { EnvError, requireEnv } from "@signal/shared";
import { createSql, fromPostgresJs } from "@signal/shared/db";
import { PgBoss } from "pg-boss";
import { healthJob } from "./jobs/health.ts";
import { registerJob, type JobDefinition } from "./jobs/registry.ts";

/** Jobs are added phase by phase. Phase 1 adds keyword-crawl, brand-track, winner-detect, rising-brands. */
const JOBS: JobDefinition<object>[] = [healthJob];

async function main() {
  loadRootEnv();
  let DATABASE_URL: string;
  try {
    ({ DATABASE_URL } = requireEnv(["DATABASE_URL"]));
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const sql = createSql(DATABASE_URL, { max: 5, appName: "signal-worker" });
  const db = fromPostgresJs(sql);

  const boss = new PgBoss({ connectionString: DATABASE_URL, schema: "pgboss", application_name: "signal-worker", max: 5 });
  boss.on("error", (err) => console.error(JSON.stringify({ t: new Date().toISOString(), msg: "pg-boss error", error: String(err) })));
  await boss.start();

  for (const job of JOBS) await registerJob(boss, db, job);
  console.log(JSON.stringify({ t: new Date().toISOString(), msg: "worker started", jobs: JOBS.map((j) => j.name) }));

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ t: new Date().toISOString(), msg: "shutting down", signal }));
    await boss.stop({ graceful: true, timeout: 30_000 }).catch(() => undefined);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => console.error(JSON.stringify({ msg: "unhandledRejection", reason: String(reason) })));
}

main().catch((err) => {
  console.error("Worker failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
