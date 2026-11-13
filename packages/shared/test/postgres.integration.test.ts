import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CostLedger, PostgresLedgerStore } from "../src/cost/ledger.ts";
import { createSql, fromPostgresJs } from "../src/db/client.ts";
import { finishJobRun, startJobRun, upsertAds } from "../src/db/repo.ts";
import { envStatus } from "../src/env.ts";
import { loadRootEnv } from "../src/env-file.ts";
import { normalizeAdLibraryItem } from "../src/sources/normalize/adLibrary.ts";

/**
 * Runs the repositories against the REAL database driver (postgres.js) and the real Supabase DB.
 * PGlite and postgres.js serialize parameters differently, so this catches driver-level bugs.
 * Everything runs inside a transaction that is always rolled back: nothing is left behind.
 */
loadRootEnv();
const ready = envStatus().find((e) => e.key === "DATABASE_URL")?.state === "configured";
const fixture = (n: string) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", n), "utf8"));
class Rollback extends Error {}

describe.skipIf(!ready)("repositories on postgres.js (rolled back)", () => {
  it("upserts, stores JSON as objects, logs costs and job runs", async () => {
    const sql = createSql(process.env.DATABASE_URL!, { max: 1, appName: "signal-test" });
    try {
      await sql
        .begin(async (tx) => {
          const db = fromPostgresJs(tx as never);
          const ads = ["raw-snake.json", "raw-camel.json", "automly-clean.json"].map((f) => normalizeAdLibraryItem(fixture(f), { source: "test_source", country: "US" })!);

          expect(await upsertAds(db, ads)).toMatchObject({ inserted: 3, updated: 0, newBrands: 3 });
          expect(await upsertAds(db, ads)).toMatchObject({ inserted: 0, updated: 3 });
          const [raw] = await db.query<{ t: string }>("select jsonb_typeof(raw) as t from public.ads where source = 'test_source' limit 1");
          expect(raw!.t).toBe("object");

          const ledger = new CostLedger(new PostgresLedgerStore(db), { defaultMonthlyBudgetUsd: 0 });
          await ledger.record({ provider: "test_provider", operation: "x", units: 1, usd: 0, meta: { a: 1 } });
          const [meta] = await db.query<{ t: string }>("select jsonb_typeof(meta) as t from public.cost_ledger where provider = 'test_provider'");
          expect(meta!.t).toBe("object");

          const id = await startJobRun(db, "test.job", null);
          await finishJobRun(db, id, { status: "succeeded", stats: { checks: { r2: { ok: true } } } });
          const [stats] = await db.query<{ t: string; r2: boolean }>("select jsonb_typeof(stats) as t, (stats #>> '{checks,r2,ok}')::boolean as r2 from public.job_runs where id = $1", [id]);
          expect(stats).toEqual({ t: "object", r2: true });

          throw new Rollback();
        })
        .catch((e) => {
          if (!(e instanceof Rollback)) throw e;
        });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 60_000);
});
