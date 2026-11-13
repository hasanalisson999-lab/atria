import "server-only";
import { FALLBACK_PROVIDERS, TIKTOK_SOURCE, fetchTikTokAds, fetchWithFallback, normName } from "@signal/shared";
import { fromPostgresJs, upsertAds, type Sql } from "@signal/shared/db";
import { dedupeCreatives } from "@signal/shared/media";

export interface MetaPage {
  page_id: string;
  name: string;
  category: string | null;
  image: string | null;
  likes: number | null;
  verified: boolean;
  ig_username: string | null;
  ig_followers: number | null;
}

/**
 * Facebook page search by name, fastest source first. Results are cached for 30 days, so each new
 * query costs at most one free credit. Order: Social Fetch company search (~1s) → SearchAPI →
 * ScrapeCreators → advertisers of matching ads from the fast providers only (never the slow
 * Apify / Bright Data jobs, which take minutes).
 */
export async function findPages(sql: Sql, rawQ: string): Promise<{ pages: MetaPage[]; source: string; cached: boolean }> {
  const q = rawQ.trim().toLowerCase().slice(0, 80);
  const key = `pages:${q}`;
  const [hit] = await sql<{ result: MetaPage[]; provider: string }[]>`select result, provider from public.search_cache where key = ${key} and created_at > now() - interval '30 days'`;
  if (hit) return { pages: hit.result, source: hit.provider, cached: true };

  let pages: MetaPage[] = [];
  let source = "none";
  const usedOf = async (provider: string) => {
    const [row] = await sql<{ used: number }[]>`select coalesce(sum(units), 0)::int as used from public.cost_ledger where provider = ${provider}`;
    return row?.used ?? 0;
  };
  const toPage = (p: Record<string, unknown>): MetaPage => ({
    page_id: String(p.page_id ?? p.pageId),
    name: String(p.name ?? ""),
    category: (p.category as string) ?? null,
    image: ((p.image_uri ?? p.imageUrl) as string) ?? null,
    likes: typeof p.likes === "number" ? p.likes : null,
    verified: /^VERIFIED|BLUE/.test(String(p.verification ?? "")),
    ig_username: ((p.ig_username ?? (p.instagram as { username?: string } | undefined)?.username) as string) ?? null,
    ig_followers: typeof p.ig_followers === "number" ? p.ig_followers : ((p.instagram as { followers?: number } | undefined)?.followers ?? null),
  });

  // 1. Social Fetch company search: ~1 second, 1 credit.
  const sfKey = process.env.SOCIALFETCH_API_KEY;
  if (sfKey && (await usedOf("socialfetch")) < 97) {
    const res = await fetch(`https://api.socialfetch.dev/v1/facebook/ad-library/companies/search?${new URLSearchParams({ query: q })}`, {
      headers: { "x-api-key": sfKey },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res) {
      const j = res.ok ? ((await res.json().catch(() => null)) as { data?: { companies?: Record<string, unknown>[] }; meta?: { creditsCharged?: number } } | null) : null;
      await sql`insert into public.cost_ledger (provider, operation, units, usd, meta) values ('socialfetch', 'page-search', ${j?.meta?.creditsCharged ?? 1}, 0, ${JSON.stringify({ free_tier: true, q })}::text::jsonb)`;
      pages = (j?.data?.companies ?? []).filter((c) => c.platform !== "instagram" && !c.pageDeleted).map(toPage);
      if (pages.length) source = "socialfetch";
    }
  }
  // 2. SearchAPI page search.
  const searchApiKey = process.env.SEARCHAPI_API_KEY;
  if (!pages.length && searchApiKey && (await usedOf("searchapi")) < 95) {
    const res = await fetch(`https://www.searchapi.io/api/v1/search?${new URLSearchParams({ engine: "meta_ad_library_page_search", q })}`, {
      headers: { Authorization: `Bearer ${searchApiKey}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    await sql`insert into public.cost_ledger (provider, operation, units, usd, meta) values ('searchapi', 'page-search', 1, 0, ${JSON.stringify({ free_tier: true, q })}::text::jsonb)`;
    if (res?.ok) {
      const j = (await res.json()) as { page_results?: Record<string, unknown>[] };
      pages = (j.page_results ?? []).map(toPage);
      source = "searchapi";
    }
  }
  // 3. ScrapeCreators company search.
  if (!pages.length && process.env.SCRAPECREATORS_API_KEY && (await usedOf("scrapecreators")) < 95) {
    const res = await fetch(`https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?${new URLSearchParams({ query: q })}`, {
      headers: { "x-api-key": process.env.SCRAPECREATORS_API_KEY },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    await sql`insert into public.cost_ledger (provider, operation, units, usd, meta) values ('scrapecreators', 'page-search', 1, 0, ${JSON.stringify({ free_tier: true, q })}::text::jsonb)`;
    if (res?.ok) {
      const j = (await res.json()) as { searchResults?: Record<string, unknown>[] };
      pages = (j.searchResults ?? []).map(toPage);
      source = "scrapecreators";
    }
  }
  if (!pages.length) {
    // 4. Advertisers of ads matching the name, fast providers only (seconds, not minutes).
    const fast = FALLBACK_PROVIDERS.filter((p) => ["serpapi", "metapi", "socialfetch", "searchapi", "socialcrawl"].includes(p.id));
    const chain = await fetchWithFallback(fromPostgresJs(sql), { q, limit: 30 }, { jobId: "page-search", providers: fast });
    const byPage = new Map<string, MetaPage>();
    for (const ad of chain.ads) {
      if (!ad.brand) continue;
      byPage.set(ad.brand.platformPageId, {
        page_id: ad.brand.platformPageId,
        name: ad.brand.name,
        category: ad.brand.category ?? null,
        image: ad.brand.logoUrl ?? null,
        likes: ad.brand.likes ?? null,
        verified: false,
        ig_username: null,
        ig_followers: null,
      });
    }
    pages = [...byPage.values()];
    source = chain.provider ?? "none";
  }
  if (pages.length) {
    await sql`insert into public.search_cache (key, provider, result) values (${key}, ${source}, ${JSON.stringify(pages)}::text::jsonb)
              on conflict (key) do update set result = excluded.result, provider = excluded.provider, created_at = now()`;
  }
  return { pages, source, cached: false };
}

/** Pages of the same brand: exact (normalized) name match, e.g. all "Mizuno" regional pages. */
export function sameBrandPages(pages: MetaPage[], name: string): MetaPage[] {
  const n = normName(name);
  return pages.filter((p) => normName(p.name) === n);
}

/** Registers extra Facebook pages as regional pages of `mainId` (their ads roll up to the main brand). */
export async function attachPages(sql: Sql, mainId: string, pages: MetaPage[]): Promise<void> {
  for (const p of pages) {
    await sql`
      insert into public.brands (platform, platform_page_id, name, logo_url, page_likes, page_category, quality, merged_into, is_curated)
      values ('meta', ${p.page_id}, ${p.name}, ${p.image}, ${p.likes}, ${p.category}, 'brand', ${mainId}, true)
      on conflict (platform, platform_page_id) do update set merged_into = case when public.brands.id = ${mainId} then null else ${mainId}::uuid end`;
  }
  // Move any ads that were stored under the regional pages onto the main brand.
  await sql`update public.ads set brand_id = ${mainId} where brand_id in (select id from public.brands where merged_into = ${mainId})`;
}

/** The brand's website: its known domain, or the most common landing domain of its ads (trackers ignored). */
export async function brandDomain(sql: Sql, brandId: string): Promise<string | null> {
  const [r] = await sql<{ d: string | null }[]>`
    select coalesce(b.website_domain, (
      select a.landing_domain from public.ads a
      where a.brand_id = b.id and a.landing_domain is not null
        and a.landing_domain !~ '(doubleclick|facebook|fb\.|instagram|bit\.ly|apple\.com|google|amazon|app\.link|onelink|linktr|shopify|tiktok|youtube|criteo|attn\.tv)'
      group by 1 order by count(*) desc limit 1)) as d
    from public.brands b where b.id = ${brandId}`;
  return r?.d ?? null;
}

export interface SyncResult {
  ads: number;
  newAds: number;
  pages: number;
  providers: string[];
  tried: string[];
}

export interface SyncProgress {
  state: "running" | "done" | "error";
  pagesDone: number;
  pagesTotal: number;
  ads: number;
  newAds: number;
  providers: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

/** In-process registry of running/finished brand syncs (polled by the UI). */
const g = globalThis as unknown as { __atriaSyncs?: Map<string, SyncProgress> };
export const syncRegistry: Map<string, SyncProgress> = (g.__atriaSyncs ??= new Map());

/**
 * Pulls every public active ad for a brand (all its pages) through the free fallback chain, then
 * collapses duplicates for that brand only. Pages are fetched in parallel; a brand synced in the last
 * two weeks gets a lighter refresh (new ads surface first), so repeat fetches are quick.
 */
export async function syncBrandAds(sql: Sql, brandId: string, opts: { limitPerPage?: number; onProgress?: (p: Partial<SyncProgress>) => void } = {}): Promise<SyncResult> {
  const db = fromPostgresJs(sql);
  const [meta] = await sql<{ recent: boolean }[]>`select (ads_synced_at > now() - interval '14 days') as recent from public.brands where id = ${brandId}`;
  const full = opts.limitPerPage ?? (meta?.recent ? 120 : 200);
  // Main page + up to 4 real regional pages (same-name fan pages with a handful of followers never advertise).
  const pages = await sql<{ platform_page_id: string; main: boolean }[]>`
    select platform_page_id, (id = ${brandId}) as main from public.brands
    where platform = 'meta' and (id = ${brandId} or (merged_into = ${brandId} and coalesce(page_likes, 0) >= 2000))
    order by (id = ${brandId}) desc, page_likes desc nulls last limit 5`;
  const domain = await brandDomain(sql, brandId);
  let total = 0;
  let inserted = 0;
  let done = 0;
  const providers = new Set<string>();
  const tried: string[] = [];
  opts.onProgress?.({ pagesTotal: pages.length });

  const store = async (ads: Awaited<ReturnType<typeof fetchWithFallback>>["ads"]) => {
    const r = await upsertAds(db, ads);
    // Ads land on the brand right away (regional pages roll up to it), so the page can show them while the rest loads.
    await sql`update public.ads set brand_id = ${brandId} where brand_id in (select id from public.brands where merged_into = ${brandId})`;
    return r;
  };

  // Instant first batch from the fastest sources (Adspo ~1s, then Parse ~5s, then Social Fetch) on every
  // fetch, while the full pull (with ad copy) runs alongside. Nobody waits on the slow bulk source.
  const main = pages.find((p) => p.main);
  const QUICK = ["adspo", "parsebot", "socialfetch"];
  const quick = main
    ? (async () => {
        const fast = FALLBACK_PROVIDERS.filter((x) => QUICK.includes(x.id)).sort((x, y) => QUICK.indexOf(x.id) - QUICK.indexOf(y.id));
        const first = await fetchWithFallback(db, { pageId: main.platform_page_id, limit: 30, domain }, { jobId: `sync:${brandId}`, providers: fast }).catch(() => null);
        if (!first?.ads.length) return;
        providers.add(first.provider ?? "?");
        const r = await store(first.ads);
        total += first.ads.length;
        inserted += r.inserted;
        opts.onProgress?.({ ads: total, newAds: inserted, providers: [...providers] });
      })()
    : Promise.resolve();

  const queue = [...pages];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      // Regional pages mostly repeat the main page's creatives, so they get a lower cap.
      const limit = p.main ? full : Math.min(meta?.recent ? 40 : 80, full);
      const chain = await fetchWithFallback(db, { pageId: p.platform_page_id, limit, domain: p.main ? domain : null }, { jobId: `sync:${brandId}` });
      tried.push(...chain.tried.map((t) => `${t.provider}: ${t.outcome}`));
      if (chain.ads.length) {
        providers.add(chain.provider ?? "?");
        const r = await store(chain.ads);
        total += chain.ads.length;
        inserted += r.inserted;
      }
      done++;
      opts.onProgress?.({ pagesDone: done, ads: total, newAds: inserted, providers: [...providers] });
    }
  };
  // TikTok runs alongside the Facebook/Instagram pages.
  const tiktok = (async () => {
    const [b] = await sql<{ name: string }[]>`select name from public.brands where id = ${brandId}`;
    if (!b) return;
    const r = await fetchTikTokAds(db, b.name, { limit: meta?.recent ? 12 : 36 }).catch(() => null);
    if (!r?.ads.length) return;
    const up = await upsertAds(db, r.ads);
    await sql`update public.ads set brand_id = ${brandId} where source = ${TIKTOK_SOURCE} and source_ad_id = any(${r.ads.map((a) => a.sourceAdId)})`;
    total += r.ads.length;
    inserted += up.inserted;
    providers.add(`tiktok:${r.provider}`);
    opts.onProgress?.({ ads: total, newAds: inserted, providers: [...providers] });
  })();
  await Promise.all([...Array.from({ length: Math.min(4, pages.length || 1) }, worker), tiktok, quick]);

  await sql`update public.ads set brand_id = ${brandId} where brand_id in (select id from public.brands where merged_into = ${brandId})`;
  await sql`update public.brands set ads_synced_at = now() where id = ${brandId}`;
  await dedupeCreatives(db, { concurrency: 8, brandId }).catch(() => undefined);
  return { ads: total, newAds: inserted, pages: pages.length, providers: [...providers], tried };
}

const g2 = globalThis as unknown as { __atriaFreshRunning?: boolean };

/**
 * Keeps the library fresh in the background: pulls the newest ads for a few brands that haven't been
 * refreshed in 6 hours, through Adspo (~1s, generous free allowance). Tracked competitors go
 * first, then the given category. Called after a page responds, so it never slows anything down.
 */
export async function refreshStale(sql: Sql, opts: { category?: string | null; max?: number } = {}): Promise<number> {
  if (g2.__atriaFreshRunning) return 0;
  g2.__atriaFreshRunning = true;
  try {
    const db = fromPostgresJs(sql);
    const stale = await sql<{ id: string; pid: string }[]>`
      select b.id, b.platform_page_id as pid from public.brands b
      where b.merged_into is null and b.platform = 'meta' and b.status <> 'ignored' and b.quality = 'brand'
        and (b.status = 'tracked' or b.category = ${opts.category ?? null}::text)
        and not exists (select 1 from public.search_cache c where c.key = 'fresh:' || b.id::text and c.created_at > now() - interval '6 hours')
      order by (b.status = 'tracked') desc, b.ads_synced_at asc nulls first
      limit ${opts.max ?? 4}`;
    // Adspo only: 10,000 free credits a year. Parse's small allowance is kept for instant first batches.
    const fast = FALLBACK_PROVIDERS.filter((x) => x.id === "adspo");
    let added = 0;
    await Promise.all(
      stale.map(async (b) => {
        await sql`insert into public.search_cache (key, provider, result) values (${`fresh:${b.id}`}, 'fresh', '{}'::jsonb)
                  on conflict (key) do update set created_at = now()`;
        const r = await fetchWithFallback(db, { pageId: b.pid, limit: 24 }, { jobId: `fresh:${b.id}`, providers: fast }).catch(() => null);
        if (!r?.ads.length) return;
        // Only what's newer than the newest ad we already have (older ones are already in the library).
        const [last] = await sql<{ d: string | null }[]>`select (max(start_date) - 1)::text as d from public.ads where brand_id = ${b.id}`;
        const fresh = r.ads.filter((a) => !last?.d || (a.startDate ?? "") >= last.d);
        if (!fresh.length) return;
        const up = await upsertAds(db, fresh);
        await sql`update public.ads set brand_id = ${b.id} where brand_id in (select id from public.brands where merged_into = ${b.id})`;
        if (up.inserted) await dedupeCreatives(db, { concurrency: 6, brandId: b.id }).catch(() => undefined);
        added += up.inserted;
      }),
    );
    return added;
  } finally {
    g2.__atriaFreshRunning = false;
  }
}
