import { loadRootEnv } from "@signal/shared/env-file";
/**
 * Phase 0 source benchmark: runs every candidate Apify scraper on the SAME Meta Ad Library queries,
 * then compares completeness, media availability, overlap, speed and real cost.
 *
 *   npm run benchmark                 -> prints the plan and cost estimate, spends nothing
 *   npm run benchmark -- --confirm    -> runs it (every run is cost-capped and logged to the cost ledger)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  APIFY_ACTORS,
  ApifyClient,
  CostLedger,
  MemoryLedgerStore,
  PostgresLedgerStore,
  envStatus,
  estimateApifyUsd,
  listPriceUsd,
  guardrails,
  normalizeAdLibraryItem,
  requireEnv,
  type KeywordQuery,
  type LedgerStore,
  type NormalizedAd,
} from "@signal/shared";
import { createSql, fromPostgresJs, upsertAds, type Queryable } from "@signal/shared/db";

const QUERIES: KeywordQuery[] = [
  { term: "gym shorts", country: "US", limit: 70, activeOnly: true },
  { term: "activewear", country: "GB", limit: 70, activeOnly: true },
  { term: "pre workout", country: "US", limit: 60, activeOnly: true },
];
// Free plan: only scrapers that fit inside Apify's $5/month free credit. The official Apify actor
// ($5.80 per 1k ads) can't fit a free budget, so it's excluded.
const ACTORS = ["curious_coder/facebook-ads-library-scraper", "automly/facebook-ad-library-scraper"];
const MEDIA_SAMPLE = 15;

const envFile = loadRootEnv();
const repoRoot = envFile ? dirname(envFile) : join(process.cwd(), "..");
const confirm = process.argv.includes("--confirm");
const { APIFY_TOKEN } = requireEnv(["APIFY_TOKEN"]);
const limits = guardrails();

const totalAds = QUERIES.reduce((a, q) => a + q.limit, 0);
const estimates = ACTORS.map((id) => ({ id, usd: estimateApifyUsd(APIFY_ACTORS[id]!, totalAds, QUERIES.length) }));
const totalEstimate = estimates.reduce((a, e) => a + e.usd, 0);

console.log(`\nSource benchmark: ${QUERIES.length} queries × ${ACTORS.length} scrapers, ${totalAds} ads per scraper`);
for (const q of QUERIES) console.log(`  • "${q.term}" in ${q.country} (${q.limit} ads)`);
for (const e of estimates) console.log(`  ${e.id.padEnd(42)} ~$${e.usd.toFixed(2)}`);
console.log(`  ${"TOTAL (estimate)".padEnd(42)} ~$${totalEstimate.toFixed(2)}\n`);

if (!confirm) {
  console.log("Nothing was spent. Re-run with --confirm to execute.");
  process.exit(0);
}
if (totalEstimate > limits.APPROVAL_THRESHOLD_USD) {
  console.error(`Estimate exceeds the $${limits.APPROVAL_THRESHOLD_USD} approval threshold; refusing.`);
  process.exit(1);
}

// Cost ledger: Postgres when the DB is configured, otherwise in-memory (and written to the report).
let store: LedgerStore = new MemoryLedgerStore();
let closeDb = async () => {};
let db: Queryable | null = null;
if (envStatus().find((e) => e.key === "DATABASE_URL")?.state === "configured") {
  const sql = createSql(process.env.DATABASE_URL!, { max: 2, appName: "signal-benchmark" });
  db = fromPostgresJs(sql);
  store = new PostgresLedgerStore(db);
  closeDb = () => sql.end({ timeout: 5 });
  console.log("Cost ledger: Postgres (public.cost_ledger)");
} else {
  console.log("Cost ledger: in-memory (DATABASE_URL not ready). Entries are saved in the report.");
}
const ledger = new CostLedger(store, { defaultMonthlyBudgetUsd: limits.MONTHLY_BUDGET_USD, approvalThresholdUsd: limits.APPROVAL_THRESHOLD_USD });
const client = new ApifyClient(APIFY_TOKEN, { retries: 4, onRetry: (i) => console.warn(`  retry #${i.attempt} in ${i.delayMs}ms: ${String(i.error).slice(0, 120)}`) });

interface ActorResult {
  id: string;
  ads: NormalizedAd[];
  rawItems: unknown[];
  skipped: number;
  usd: number;
  seconds: number;
  runs: { query: string; runId: string; status: string; items: number; usd: number; seconds: number }[];
  errors: string[];
}

async function runActor(id: string): Promise<ActorResult> {
  const spec = APIFY_ACTORS[id]!;
  const res: ActorResult = { id, ads: [], rawItems: [], skipped: 0, usd: 0, seconds: 0, runs: [], errors: [] };
  const seen = new Set<string>();
  for (const q of QUERIES) {
    const estimate = estimateApifyUsd(spec, q.limit);
    const t0 = Date.now();
    try {
      await ledger.track(
        "apify",
        `benchmark:${id}`,
        estimate,
        async () => {
          const started = await client.startRun(id, spec.keywordInput(q), { maxTotalChargeUsd: Math.max(0.05, Math.ceil(estimate * 150) / 100) });
          const run = await client.waitForFinish(started.id, 20 * 60_000);
          const items = run.defaultDatasetId ? await client.getAllItems(run.defaultDatasetId) : [];
          const usd = Math.max(client.runCostUsd(run), listPriceUsd(spec, items.length));
          const seconds = (Date.now() - t0) / 1000;
          res.runs.push({ query: `${q.term} / ${q.country}`, runId: run.id, status: run.status, items: items.length, usd, seconds });
          for (const item of items) {
            res.rawItems.push(item);
            const ad = normalizeAdLibraryItem(item, { source: "meta_ad_library", country: q.country });
            if (!ad) res.skipped++;
            else if (!seen.has(ad.sourceAdId)) {
              seen.add(ad.sourceAdId);
              res.ads.push(ad);
            }
          }
          res.usd += usd;
          res.seconds += seconds;
          console.log(`  ${id} · "${q.term}" ${q.country}: ${run.status}, ${items.length} items, $${usd.toFixed(4)}, ${seconds.toFixed(0)}s`);
          return { result: null, units: items.length, usd, meta: { runId: run.id, query: q } };
        },
        { jobId: "benchmark" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.errors.push(`${q.term}/${q.country}: ${msg}`);
      console.error(`  ${id} · "${q.term}" ${q.country}: FAILED ${msg.slice(0, 200)}`);
    }
  }
  return res;
}

const FIELDS: [string, (a: NormalizedAd) => boolean][] = [
  ["body text", (a) => !!a.bodyText],
  ["headline", (a) => !!a.headline],
  ["CTA", (a) => !!a.cta],
  ["landing URL", (a) => !!a.landingUrl],
  ["start date", (a) => !!a.startDate],
  ["platforms", (a) => a.platforms.length > 0],
  ["brand name", (a) => !!a.brand?.name && a.brand.name !== a.brand.platformPageId],
  ["brand logo", (a) => !!a.brand?.logoUrl],
  ["any media URL", (a) => a.media.length > 0],
  ["video URL (video ads)", (a) => a.format !== "video" || a.media.some((m) => m.type === "video")],
  ["known format", (a) => a.format !== "unknown"],
  ["variations count > 1", (a) => a.variationsCount > 1],
];

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

async function probeMedia(ads: NormalizedAd[]) {
  const urls = ads.flatMap((a) => a.media.slice(0, 1).map((m) => ({ url: m.url, type: m.type }))).slice(0, MEDIA_SAMPLE);
  let ok = 0;
  let videoOk = 0;
  let videos = 0;
  for (const u of urls) {
    if (u.type === "video") videos++;
    try {
      const r = await fetch(u.url, { headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(15_000) });
      const good = r.status === 200 || r.status === 206;
      if (good) {
        ok++;
        if (u.type === "video") videoOk++;
      }
      await r.body?.cancel();
    } catch {
      /* counted as failure */
    }
  }
  return { sampled: urls.length, ok, videos, videoOk };
}

const results: ActorResult[] = [];
for (const id of ACTORS) {
  console.log(`\n▶ ${APIFY_ACTORS[id]!.label}`);
  results.push(await runActor(id));
}

// Overlap: ads every scraper returned. Completeness is also measured on this common set.
const idSets = results.map((r) => new Set(r.ads.map((a) => a.sourceAdId)));
const common = [...(idSets[0] ?? new Set<string>())].filter((id) => idSets.every((s) => s.has(id)));
const commonSet = new Set(common);

const rows = [];
for (const r of results) {
  const media = await probeMedia(r.ads);
  const onCommon = r.ads.filter((a) => commonSet.has(a.sourceAdId));
  const completeness = FIELDS.map(([name, fn]) => ({ name, all: pct(r.ads.filter(fn).length, r.ads.length), common: pct(onCommon.filter(fn).length, onCommon.length) }));
  const core = completeness.filter((c) => !["variations count > 1"].includes(c.name));
  const avgCompleteness = core.reduce((a, c) => a + c.all, 0) / core.length;
  const formats = r.ads.reduce<Record<string, number>>((acc, a) => ((acc[a.format] = (acc[a.format] ?? 0) + 1), acc), {});
  rows.push({
    id: r.id,
    label: APIFY_ACTORS[r.id]!.label,
    ads: r.ads.length,
    rawItems: r.rawItems.length,
    skipped: r.skipped,
    usd: r.usd,
    per1k: r.ads.length ? (r.usd / r.ads.length) * 1000 : null,
    seconds: r.seconds,
    errors: r.errors,
    runs: r.runs,
    media,
    completeness,
    avgCompleteness,
    formats,
  });
}

// Save raw output (local only, gitignored) and two real fixtures per actor for normalizer tests.
const rawDir = join(repoRoot, "reports", "benchmark-raw");
mkdirSync(rawDir, { recursive: true });
for (const r of results) {
  const slug = r.id.replace("/", "__");
  writeFileSync(join(rawDir, `${slug}.json`), JSON.stringify(r.rawItems, null, 2));
  if (r.rawItems.length) {
    writeFileSync(join(repoRoot, "packages/shared/test/fixtures", `real-${slug}.json`), JSON.stringify(r.rawItems.slice(0, 2), null, 2));
  }
}

const spentTotal = rows.reduce((a, r) => a + r.usd, 0);
const fmt$ = (n: number | null) => (n === null ? "n/a" : `$${n.toFixed(n < 1 ? 3 : 2)}`);
const lines: string[] = [];
lines.push(`# Source benchmark: Meta Ad Library scrapers`, "");
lines.push(`Run: ${new Date().toISOString()} · Queries: ${QUERIES.map((q) => `"${q.term}" ${q.country} (${q.limit})`).join(", ")}`);
lines.push(`Total spent: **${fmt$(spentTotal)}** (estimate was ${fmt$(totalEstimate)}) · Ads every scraper returned: **${common.length}**`, "");
lines.push("## Summary", "");
lines.push("| Scraper | Unique ads | Avg completeness | Media reachable | Real cost | Cost / 1k ads | Time |");
lines.push("|---|---:|---:|---:|---:|---:|---:|");
for (const r of rows)
  lines.push(
    `| ${r.label} | ${r.ads} | ${r.avgCompleteness.toFixed(1)}% | ${r.media.ok}/${r.media.sampled} (video ${r.media.videoOk}/${r.media.videos}) | ${fmt$(r.usd)} | ${fmt$(r.per1k)} | ${Math.round(r.seconds)}s |`,
  );
lines.push("", "## Field completeness (all ads / ads every scraper returned)", "");
lines.push(`| Field | ${rows.map((r) => r.id.split("/")[0]).join(" | ")} |`);
lines.push(`|---|${rows.map(() => "---:").join("|")}|`);
for (let i = 0; i < FIELDS.length; i++) lines.push(`| ${FIELDS[i]![0]} | ${rows.map((r) => `${r.completeness[i]!.all}% / ${r.completeness[i]!.common}%`).join(" | ")} |`);
lines.push("", "## Formats", "");
for (const r of rows) lines.push(`- **${r.id}**: ${Object.entries(r.formats).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
lines.push("", "## Runs", "");
for (const r of rows) {
  lines.push(`**${r.id}**`);
  for (const run of r.runs) lines.push(`- ${run.query}: ${run.status}, ${run.items} items, ${fmt$(run.usd)}, ${Math.round(run.seconds)}s (run ${run.runId})`);
  for (const e of r.errors) lines.push(`- ❌ ${e}`);
  lines.push("");
}
lines.push("## Recommendation", "", "_Filled in after reviewing the numbers above._", "");
const reportPath = join(repoRoot, "reports", "source-benchmark.md");
writeFileSync(reportPath, lines.join("\n"));
writeFileSync(join(repoRoot, "reports", "source-benchmark.json"), JSON.stringify({ rows, common: common.length, spentTotal, ledger: store instanceof MemoryLedgerStore ? store.entries : "postgres" }, null, 2));

// Every ad found is real public data: keep it in the library (idempotent upsert).
if (db) {
  const all = results.flatMap((r) => r.ads);
  let inserted = 0;
  let updated = 0;
  let newBrands = 0;
  for (let i = 0; i < all.length; i += 200) {
    const res = await upsertAds(db, all.slice(i, i + 200));
    inserted += res.inserted;
    updated += res.updated;
    newBrands += res.newBrands;
  }
  console.log(`Library: +${inserted} new ads, ${updated} refreshed, +${newBrands} new brands`);
}

console.log(`\nReport: ${reportPath}`);
console.log(`Spent: ${fmt$(spentTotal)}`);
await closeDb();
