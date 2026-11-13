import { loadRootEnv } from "@signal/shared/env-file";
/**
 * Imports REAL brands: resolves each curated brand to its official Facebook page, then pulls that
 * page's highest-impression active ads. Only ads from the official pages are stored, so resellers
 * and dropshippers that mention the brand are ignored.
 *
 *   npx tsx src/seed-brands.ts                -> plan + estimate (spends nothing)
 *   npx tsx src/seed-brands.ts --confirm      -> run (2 batched Apify runs, free credit, cost-capped)
 *   ... --niche footwear                      -> only one niche
 */
import {
  APIFY_ACTORS,
  ApifyClient,
  CostLedger,
  PostgresLedgerStore,
  SEED_BRANDS,
  adLibraryKeywordUrl,
  adLibraryPageUrl,
  guardrails,
  listPriceUsd,
  normalizeAdLibraryItem,
  pickBrandPage,
  requireEnv,
  type NormalizedAd,
  type PageCandidate,
  type SeedBrand,
} from "@signal/shared";
import { createSql, fromPostgresJs, upsertAds } from "@signal/shared/db";

loadRootEnv();
const { APIFY_TOKEN, DATABASE_URL, APIFY_ACTOR_ID } = requireEnv(["APIFY_TOKEN", "DATABASE_URL", "APIFY_ACTOR_ID"]);
const confirm = process.argv.includes("--confirm");
const nicheArg = process.argv.includes("--niche") ? process.argv[process.argv.indexOf("--niche") + 1] : undefined;
const RESOLVE_PER_BRAND = 12;
const ADS_PER_BRAND: Record<string, number> = { footwear: 45, apparel: 30, supplements: 20 };

const spec = APIFY_ACTORS[APIFY_ACTOR_ID];
if (!spec || !APIFY_ACTOR_ID.startsWith("curious_coder/")) throw new Error(`Batch import needs curious_coder (got ${APIFY_ACTOR_ID})`);

const brands = SEED_BRANDS.filter((b) => !nicheArg || b.niche === nicheArg);
const sql = createSql(DATABASE_URL, { max: 2, appName: "signal-seed-brands" });
const db = fromPostgresJs(sql);
const ledger = new CostLedger(new PostgresLedgerStore(db), { defaultMonthlyBudgetUsd: guardrails().MONTHLY_BUDGET_USD });
const client = new ApifyClient(APIFY_TOKEN, { retries: 4 });

// Skip brands already resolved earlier (re-runs only fetch fresh ads).
const known = await sql<{ name: string; platform_page_id: string }[]>`select name, platform_page_id from public.brands where is_curated`;
const knownByName = new Map(known.map((k) => [k.name, k.platform_page_id]));
const toResolve = brands.filter((b) => !knownByName.has(b.name));

const resolveAds = toResolve.length * RESOLVE_PER_BRAND;
const fetchAds = brands.reduce((a, b) => a + (ADS_PER_BRAND[b.niche] ?? 30), 0);
const estimate = listPriceUsd(spec, resolveAds) + listPriceUsd(spec, fetchAds);
console.log(`Brands: ${brands.length} (${toResolve.length} to resolve). Estimated ~${resolveAds + fetchAds} ads, ~$${estimate.toFixed(2)} of Apify free credit.`);
const budget = await ledger.status("apify");
console.log(`Apify allowance this month: $${budget.spentUsd.toFixed(2)} used of $${budget.budgetUsd.toFixed(2)}.`);
if (!confirm) {
  console.log("Nothing spent. Re-run with --confirm.");
  await sql.end();
  process.exit(0);
}

async function runBatch(operation: string, urls: string[], perSource: number, extra: Record<string, unknown> = {}) {
  const total = urls.length * perSource;
  const est = listPriceUsd(spec!, total);
  return ledger.track("apify", `${spec!.id}:${operation}`, est, async () => {
    const run = await client.startRun(
      spec!.id,
      { urls: urls.map((url) => ({ url })), count: total, limitPerSource: perSource, scrapeAdDetails: false, "scrapePageAds.activeStatus": "active", ...extra },
      { maxTotalChargeUsd: Math.max(0.05, Math.ceil(est * 130) / 100) },
    );
    console.log(`  ${operation}: run ${run.id} started (${urls.length} sources × ${perSource})`);
    const done = await client.waitForFinish(run.id, 30 * 60_000);
    const items = done.defaultDatasetId ? await client.getAllItems(done.defaultDatasetId) : [];
    const usd = Math.max(client.runCostUsd(done), listPriceUsd(spec!, items.length));
    console.log(`  ${operation}: ${done.status}, ${items.length} items, $${usd.toFixed(3)}`);
    return { result: items, units: items.length, usd, meta: { runId: done.id, status: done.status } };
  });
}

// 1) Resolve official pages.
const resolved = new Map<string, PageCandidate>(); // brand name -> page
for (const b of brands) {
  const id = knownByName.get(b.name);
  if (id) resolved.set(b.name, { pageId: id, name: b.name, likes: null, ads: 0 });
}
const keywordAds: NormalizedAd[] = [];
if (toResolve.length) {
  const items = await runBatch("resolve-brands", toResolve.map((b) => adLibraryKeywordUrl({ term: b.query, country: "US", limit: RESOLVE_PER_BRAND, activeOnly: true })), RESOLVE_PER_BRAND);
  const pages = new Map<string, PageCandidate>();
  for (const it of items) {
    const ad = normalizeAdLibraryItem(it, { source: "meta_ad_library", country: "US" });
    if (!ad?.brand) continue;
    keywordAds.push(ad);
    const p = pages.get(ad.brand.platformPageId) ?? { pageId: ad.brand.platformPageId, name: ad.brand.name, likes: ad.brand.likes ?? null, ads: 0 };
    p.ads++;
    p.likes = Math.max(p.likes ?? 0, ad.brand.likes ?? 0) || p.likes;
    pages.set(p.pageId, p);
  }
  for (const b of toResolve) {
    const page = pickBrandPage(b, [...pages.values()]);
    if (page) resolved.set(b.name, page);
  }
}
const unresolved = brands.filter((b) => !resolved.has(b.name));
console.log(`Resolved ${resolved.size}/${brands.length} official pages.${unresolved.length ? ` Not found: ${unresolved.map((b) => b.name).join(", ")}` : ""}`);

// 2) Pull each official page's top ads (highest impressions first), grouped by niche limit.
const fetched: NormalizedAd[] = [];
const byNiche = new Map<string, SeedBrand[]>();
for (const b of brands) if (resolved.has(b.name)) byNiche.set(b.niche, [...(byNiche.get(b.niche) ?? []), b]);
for (const [niche, list] of byNiche) {
  const per = ADS_PER_BRAND[niche] ?? 30;
  const items = await runBatch(`brand-ads-${niche}`, list.map((b) => adLibraryPageUrl({ pageId: resolved.get(b.name)!.pageId, limit: per, activeOnly: true })), per);
  for (const it of items) {
    const ad = normalizeAdLibraryItem(it, { source: "meta_ad_library" });
    if (ad) fetched.push(ad);
  }
}

// 3) Keep only ads from official pages, store, and mark brands curated + tracked.
const officialIds = new Set([...resolved.values()].map((p) => p.pageId));
const keep = [...keywordAds, ...fetched].filter((a) => a.brand && officialIds.has(a.brand.platformPageId));
let inserted = 0;
let updated = 0;
for (let i = 0; i < keep.length; i += 200) {
  const r = await upsertAds(db, keep.slice(i, i + 200));
  inserted += r.inserted;
  updated += r.updated;
}
for (const b of brands) {
  const page = resolved.get(b.name);
  if (!page) continue;
  await sql`
    update public.brands set name = ${b.name}, category = ${b.niche}, aliases = ${b.aliases}, is_curated = true, quality = 'brand', ads_synced_at = now()
    where platform = 'meta' and platform_page_id = ${page.pageId}`;
}
console.log(`Stored ${keep.length} official-brand ads (+${inserted} new, ${updated} refreshed). Dropped ${keywordAds.length + fetched.length - keep.length} ads from non-official pages.`);
const after = await ledger.status("apify");
console.log(`Apify allowance: $${after.spentUsd.toFixed(2)} used of $${after.budgetUsd.toFixed(2)}.`);
await sql.end();
