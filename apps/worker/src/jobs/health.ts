import { envStatus, fetchJson } from "@signal/shared";
import { r2FromEnv } from "@signal/shared/storage";
import { defineJob } from "./registry.ts";

/**
 * system.health — verifies every configured dependency with free calls only
 * (DB round-trip, R2 HeadBucket, Apify /users/me). Results land in job_runs and on the Settings page.
 */
export const healthJob = defineJob({
  name: "system.health",
  cron: "0 */6 * * *",
  runOnBoot: true,
  retryLimit: 0,
  handler: async (_data, { db, log }) => {
    const checks: Record<string, { ok: boolean; detail?: string; ms?: number }> = {};
    const time = async (name: string, fn: () => Promise<string | void>) => {
      const t = Date.now();
      try {
        const detail = await fn();
        checks[name] = { ok: true, ms: Date.now() - t, ...(detail ? { detail } : {}) };
      } catch (err) {
        checks[name] = { ok: false, ms: Date.now() - t, detail: err instanceof Error ? err.message : String(err) };
      }
    };

    await time("database", async () => {
      const [row] = await db.query<{ v: string }>("select current_setting('server_version') as v");
      return `Postgres ${row?.v}`;
    });

    const env = envStatus();
    const configured = (k: string) => env.find((e) => e.key === k)?.state === "configured";

    if (configured("R2_BUCKET")) await time("r2", async () => r2FromEnv().healthCheck());
    if (configured("APIFY_TOKEN"))
      await time("apify", async () => {
        const me = await fetchJson<{ data: { plan?: { id?: string } } }>("https://api.apify.com/v2/users/me", {
          headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
          timeoutMs: 15_000,
        });
        return `plan ${me.data.plan?.id ?? "unknown"}`;
      });

    const failed = Object.entries(checks).filter(([, c]) => !c.ok);
    log("health", { checks });
    if (failed.length) throw new Error(failed.map(([k, c]) => `${k}: ${c.detail}`).join("; "));
    return { checks, envMissing: env.filter((e) => e.state !== "configured" && !e.optional && e.phase === 0).map((e) => e.key) };
  },
});
