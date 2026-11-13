import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { envStatus } from "@signal/shared/env";
import { getJobRuns, getOverview } from "./data";

export type StepState = "done" | "todo" | "blocked";

export interface SetupStep {
  id: string;
  title: string;
  detail: string;
  state: StepState;
}

const repoRoot = () => join(process.cwd(), "..", "..");

/** Real Phase 0 progress, derived from env, the database and the filesystem. Nothing is hard-coded as done. */
export async function getSetupSteps(): Promise<SetupStep[]> {
  const env = envStatus();
  const phase0 = env.filter((e) => e.phase === 0 && !e.optional);
  const configured = phase0.filter((e) => e.state === "configured").length;
  const dbKey = env.find((e) => e.key === "DATABASE_URL")!;
  const [overview, runs] = await Promise.all([getOverview(), getJobRuns(50)]);
  const health = runs.ok ? runs.data.find((r) => r.job_name === "system.health" && r.status !== "running") : undefined;
  const r2 = health?.stats && (health.stats as { checks?: Record<string, { ok: boolean }> }).checks?.r2;
  const benchmarkDone = existsSync(join(repoRoot(), "reports", "source-benchmark.md"));
  const actorChosen = env.find((e) => e.key === "APIFY_ACTOR_ID")?.state === "configured";

  return [
    {
      id: "env",
      title: "API keys in .env",
      detail: `${configured} of ${phase0.length} Phase 0 keys configured`,
      state: configured === phase0.length ? "done" : "todo",
    },
    {
      id: "db",
      title: "Database migrated",
      detail: overview.ok
        ? `${overview.data.migrations.length} migrations applied · ${overview.data.keywords.active} seed keywords`
        : dbKey.state !== "configured"
          ? "Add your Supabase database password to DATABASE_URL"
          : overview.reason,
      state: overview.ok ? "done" : "todo",
    },
    {
      id: "worker",
      title: "Worker health check",
      detail: health
        ? health.status === "succeeded"
          ? `Database${r2 ? ", R2" : ""} and Apify reachable · ${new Date(health.started_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
          : `Last check failed: ${health.error ?? "unknown error"}`
        : "Start the worker (npm run dev) to verify DB, R2 and Apify",
      state: health?.status === "succeeded" ? "done" : overview.ok ? "todo" : "blocked",
    },
    {
      id: "benchmark",
      title: "Source benchmark",
      detail: benchmarkDone ? "Report ready in reports/source-benchmark.md" : "Compare 3 Apify scrapers on the same queries (~$2, asks first)",
      state: benchmarkDone ? "done" : "todo",
    },
    {
      id: "actor",
      title: "Pick a data source",
      detail: actorChosen ? "APIFY_ACTOR_ID is set" : "Choose a scraper from the benchmark → APIFY_ACTOR_ID",
      state: actorChosen ? "done" : benchmarkDone ? "todo" : "blocked",
    },
  ];
}
