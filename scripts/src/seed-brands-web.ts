import { loadRootEnv } from "@signal/shared/env-file";
/**
 * Second resolution pass for curated brands the keyword search couldn't find: read the official
 * Facebook link from each brand's own website, then scrape that exact page's top ads.
 * Pages whose handle was guessed (site blocked us) are only accepted if the page name matches the brand.
 *
 *   npx tsx src/seed-brands-web.ts [--confirm]
 */
import {
  APIFY_ACTORS,
  ApifyClient,
  CostLedger,
  PostgresLedgerStore,
  SEED_BRANDS,
  facebookHandleFromHtml,
  guardrails,
  listPriceUsd,
  normName,
  normalizeAdLibraryItem,
  requireEnv,
  type NormalizedAd,
  type SeedBrand,
} from "@signal/shared";
import { createSql, fromPostgresJs, upsertAds } from "@signal/shared/db";

loadRootEnv();
const { APIFY_TOKEN, DATABASE_URL, APIFY_ACTOR_ID } = requireEnv(["APIFY_TOKEN", "DATABASE_URL", "APIFY_ACTOR_ID"]);
const confirm = process.argv.includes("--confirm");
const ADS_PER_BRAND: Record<string, number> = { footwear: 45, apparel: 30, supplements: 20 };
const spec = APIFY_ACTORS[APIFY_ACTOR_ID]!;
const sql = createSql(DATABASE_URL, { max: 2, appName: "signal-seed-brands-web" });
const db = fromPostgresJs(sql);
const ledger = new CostLedger(new PostgresLedgerStore(db), { defaultMonthlyBudgetUsd: guardrails().MONTHLY_BUDGET_USD });
const client = new ApifyClient(APIFY_TOKEN, { retries: 4 });

const done = new Set((await sql<{ name: string }[]>`select name from public.brands where is_curated`).map((r) => r.name));
const todo = SEED_BRANDS.filter((b) => !done.has(b.name));

async function handleFor(b: SeedBrand): Promise<{ handle: string; official: boolean }> {
  if (b.domain) {
    try {
      const r = await fetch(`https://${b.domain}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 SignalBot", "Accept-Language": "en-US" },
        signal: AbortSignal.timeout(20_000),
      });
      const h = facebookHandleFromHtml(await r.text());
      if (h) return { handle: h, official: true };
    } catch {
      /* fall through to a guess */
    }
  }
  return { handle: normName(b.domain?.split(".")[0] ?? b.name), official: false };
}

const handles = new Map<string, { brand: SeedBrand; official: boolean }>();
for (const b of todo) {
  const h = await handleFor(b);
  handles.set(h.handle, { brand: b, official: h.official });
}
const totalAds = todo.reduce((a, b) => a + (ADS_PER_BRAND[b.niche] ?? 30), 0);
console.log(`${todo.length} brands → pages: ${[...handles.entries()].map(([h, v]) => `${v.brand.name}=fb/${h}${v.official ? "" : "?"}`).join(", ")}`);
console.log(`Estimated ${totalAds} ads, ~$${listPriceUsd(spec, totalAds).toFixed(2)} of Apify free credit.`);
if (!confirm || !todo.length) {
  console.log(todo.length ? "Nothing spent. Re-run with --confirm." : "All curated brands already resolved.");
  await sql.end();
  process.exit(0);
}

const byNiche = new Map<string, string[]>();
for (const [h, v] of handles) byNiche.set(v.brand.niche, [...(byNiche.get(v.brand.niche) ?? []), h]);

const ads: NormalizedAd[] = [];
for (const [niche, list] of byNiche) {
  const per = ADS_PER_BRAND[niche] ?? 30;
  const est = listPriceUsd(spec, list.length * per);
  const items = await ledger.track("apify", `${spec.id}:brand-pages-${niche}`, est, async () => {
    const run = await client.startRun(
      spec.id,
      {
        urls: list.map((h) => ({ url: `https://www.facebook.com/${h}` })),
        count: list.length * per,
        limitPerSource: per,
        scrapeAdDetails: false,
        "scrapePageAds.activeStatus": "active",
        "scrapePageAds.countryCode": "ALL",
        "scrapePageAds.sortBy": "impressions_desc",
      },
      { maxTotalChargeUsd: Math.max(0.05, Math.ceil(est * 130) / 100) },
    );
    const fin = await client.waitForFinish(run.id, 30 * 60_000);
    const its = fin.defaultDatasetId ? await client.getAllItems(fin.defaultDatasetId) : [];
    const usd = Math.max(client.runCostUsd(fin), listPriceUsd(spec, its.length));
    console.log(`  ${niche}: ${fin.status}, ${its.length} items, $${usd.toFixed(3)}`);
    return { result: its, units: its.length, usd, meta: { runId: fin.id } };
  });
  for (const it of items) {
    const ad = normalizeAdLibraryItem(it, { source: "meta_ad_library" });
    if (ad) ads.push(ad);
  }
}

// Map each page back to its brand via the page's profile URL handle, or an exact name match.
const pageToBrand = new Map<string, SeedBrand>();
for (const ad of ads) {
  if (!ad.brand || pageToBrand.has(ad.brand.platformPageId)) continue;
  const uriHandle = ad.brand.pageUrl?.match(/facebook\.com\/([^/?#]+)/i)?.[1]?.toLowerCase();
  const viaHandle = uriHandle ? handles.get(uriHandle) : undefined;
  const viaName = todo.find((b) => b.aliases.some((a) => normName(a) === normName(ad.brand!.name)));
  const match = viaHandle && (viaHandle.official || viaName === viaHandle.brand) ? viaHandle.brand : viaName;
  if (match) pageToBrand.set(ad.brand.platformPageId, match);
}

const keep = ads.filter((a) => a.brand && pageToBrand.has(a.brand.platformPageId));
for (let i = 0; i < keep.length; i += 200) await upsertAds(db, keep.slice(i, i + 200));
for (const [pageId, b] of pageToBrand) {
  await sql`
    update public.brands set name = ${b.name}, category = ${b.niche}, aliases = ${b.aliases}, is_curated = true, quality = 'brand', ads_synced_at = now()
    where platform = 'meta' and platform_page_id = ${pageId}`;
}
const resolvedNames = new Set([...pageToBrand.values()].map((b) => b.name));
console.log(`Resolved ${resolvedNames.size}/${todo.length}: ${[...resolvedNames].join(", ")}`);
const left = todo.filter((b) => !resolvedNames.has(b.name)).map((b) => b.name);
if (left.length) console.log(`Still missing: ${left.join(", ")}`);
console.log(`Stored ${keep.length} ads; dropped ${ads.length - keep.length} from unmatched pages.`);
const st = await ledger.status("apify");
console.log(`Apify allowance: $${st.spentUsd.toFixed(2)} used of $${st.budgetUsd.toFixed(2)}.`);
await sql.end();
