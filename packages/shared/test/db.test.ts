import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CostLedger, PostgresLedgerStore, BudgetExceededError } from "../src/cost/ledger.ts";
import { fromPglite, type Queryable } from "../src/db/client.ts";
import { loadMigrations, migratePglite } from "../src/db/migrate.ts";
import { finishJobRun, startJobRun, upsertAds } from "../src/db/repo.ts";
import { normalizeAdLibraryItem } from "../src/sources/normalize/adLibrary.ts";
import type { NormalizedAd } from "../src/types.ts";

/** Minimal stand-ins for what Supabase provides (auth schema, roles), so the real migrations run unchanged. */
const SUPABASE_SHIM = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
`;

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"));
const ctx = { source: "meta_ad_library", country: "US" };

let pg: PGlite;
let db: Queryable;

beforeAll(async () => {
  pg = new PGlite({ extensions: { vector, pg_trgm } });
  await pg.exec(SUPABASE_SHIM);
  const all = loadMigrations(join(import.meta.dirname, "../../../supabase/migrations"));
  const applied = await migratePglite(pg, all);
  expect(applied).toEqual(all.map((m) => m.name));
  expect(applied.slice(0, 4)).toEqual(["0001_extensions.sql", "0002_core.sql", "0003_rls.sql", "0004_seed_keywords.sql"]);
  db = fromPglite(pg);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table}`))[0]!.n);

describe("migrations", () => {
  it("are idempotent (second run applies nothing)", async () => {
    expect(await migratePglite(pg, loadMigrations(join(import.meta.dirname, "../../../supabase/migrations")))).toEqual([]);
  });

  it("seed keywords: 21 x 9 general + 10 x 3 footwear", async () => {
    expect(await count("public.keywords")).toBe(189 + 30);
  });

  it("enable RLS on every app table", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'signal_migrations'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(14);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("create the HNSW + full-text indexes", async () => {
    const idx = (await db.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'")).map((r) => r.indexname);
    expect(idx).toEqual(expect.arrayContaining(["ad_embeddings_hnsw", "brand_embeddings_hnsw", "ads_search_idx", "ads_days_running_idx", "brands_name_trgm_idx"]));
  });
});

describe("upsertAds", () => {
  const ads = (): NormalizedAd[] => ["raw-snake.json", "raw-camel.json", "automly-clean.json"].map((f) => normalizeAdLibraryItem(fixture(f), ctx)!);

  it("inserts ads and their brands", async () => {
    const r = await upsertAds(db, ads());
    expect(r).toMatchObject({ inserted: 3, updated: 0, newBrands: 3 });
    expect(await count("public.ads")).toBe(3);
    expect(await count("public.brands")).toBe(3);
  });

  it("is idempotent: re-running creates zero duplicates", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await upsertAds(db, ads());
      expect(r).toMatchObject({ inserted: 0, updated: 3, newBrands: 0 });
    }
    expect(await count("public.ads")).toBe(3);
    expect(await count("public.brands")).toBe(3);
  });

  it("collapses duplicates inside one batch", async () => {
    const one = ads()[0]!;
    const r = await upsertAds(db, [one, { ...one }, { ...one }]);
    expect(r.inserted + r.updated).toBe(1);
    expect(await count("public.ads")).toBe(3);
  });

  it("updates status when an ad stops, merges countries, keeps first start_date", async () => {
    const snake = fixture("raw-snake.json");
    const stopped = normalizeAdLibraryItem(
      { ...snake, is_active: false, end_date: 1762905600, start_date: 1760400000, targeted_or_reached_countries: ["GB"] },
      ctx,
    )!;
    await upsertAds(db, [stopped]);
    const [row] = await db.query<{ is_active: boolean; end_date: string; start_date: string; countries: string[]; days_running: number }>(
      "select is_active, end_date::text, start_date::text, countries, days_running from public.ads where source_ad_id = $1",
      ["1111111111111111"],
    );
    expect(row).toMatchObject({ is_active: false, end_date: "2025-11-12", start_date: "2025-10-11", countries: ["GB", "US"], days_running: 32 });
  });

  it("does not wipe existing copy when a later scrape is sparser", async () => {
    const sparse = { ...ads()[2]!, bodyText: null, headline: null };
    await upsertAds(db, [sparse]);
    const [row] = await db.query<{ body_text: string; headline: string }>("select body_text, headline from public.ads where source_ad_id = $1", ["7777777777777777"]);
    expect(row).toEqual({ body_text: "Seamless sets built for lifting.", headline: "Seamless Set" });
  });

  it("stores feed preview URLs (video poster + video, or first image)", async () => {
    const rows = await db.query<{ source_ad_id: string; thumbnail_url: string | null; video_url: string | null; media_count: number }>(
      "select source_ad_id, thumbnail_url, video_url, media_count from public.ads order by source_ad_id",
    );
    const byId = Object.fromEntries(rows.map((r) => [r.source_ad_id, r]));
    expect(byId["1111111111111111"]).toMatchObject({ thumbnail_url: "https://scontent.xx.fbcdn.net/v/preview.jpg?oh=1", video_url: "https://video.xx.fbcdn.net/v/hd.mp4?oh=1", media_count: 1 });
    expect(byId["4444444444444444"]).toMatchObject({ thumbnail_url: "https://scontent.xx.fbcdn.net/v/card1.jpg?a=1", video_url: null, media_count: 2 });
  });

  it("full-text search finds ads by copy", async () => {
    const rows = await db.query<{ source_ad_id: string }>("select source_ad_id from public.ads where search_tsv @@ plainto_tsquery('simple', $1)", ["squat shorts"]);
    expect(rows.map((r) => r.source_ad_id)).toEqual(["1111111111111111"]);
  });

  it("keeps the same brand across ads of the same page", async () => {
    const a = { ...ads()[0]!, sourceAdId: "1111111111111112" };
    const r = await upsertAds(db, [a]);
    expect(r).toMatchObject({ inserted: 1, newBrands: 0 });
    expect(await count("public.brands")).toBe(3);
  });
});

describe("cost ledger on Postgres", () => {
  it("persists spend and enforces budgets from the table", async () => {
    const ledger = new CostLedger(new PostgresLedgerStore(db), { defaultMonthlyBudgetUsd: 1 });
    await ledger.record({ provider: "apify", operation: "test", units: 10, usd: 0.75, jobId: "j1", meta: { a: 1 } });
    expect((await ledger.status("apify")).spentUsd).toBeCloseTo(0.75);
    await expect(ledger.guard("apify", "test", 0.3)).rejects.toBeInstanceOf(BudgetExceededError);
    await db.query("insert into public.provider_budgets (provider, monthly_usd) values ('apify', 2)");
    await expect(ledger.guard("apify", "test", 0.3)).resolves.toBeTruthy();
  });
});

describe("job runs", () => {
  it("records lifecycle", async () => {
    const id = await startJobRun(db, "system.health", "abc");
    await finishJobRun(db, id, { status: "failed", stats: { checked: 2 }, error: "R2 down" });
    const [row] = await db.query<{ status: string; error: string; finished_at: string | null }>("select status, error, finished_at from public.job_runs where id = $1", [id]);
    expect(row).toMatchObject({ status: "failed", error: "R2 down" });
    expect(row!.finished_at).not.toBeNull();
  });
});
