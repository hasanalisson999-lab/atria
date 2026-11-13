import type { Queryable } from "../db/client.ts";
import { HttpError, fetchJson, withRetry } from "../retry.ts";
import type { NormalizedAd } from "../types.ts";
import { APIFY_ACTORS } from "./apify/actors.ts";
import { metapiProvider } from "./metapi.ts";
import { socialFetchProvider } from "./socialfetch.ts";
import { brightDataProvider } from "./brightdata.ts";
import { parseBotProvider } from "./parsebot.ts";
import { adspoProvider } from "./adspo.ts";
import { normalizeAdLibraryItem } from "./normalize/adLibrary.ts";

/**
 * Free-tier fallback chain for Meta Ad Library data. Each provider has a free allowance that is
 * tracked in the cost ledger (usd = 0, units = requests/credits). When a provider's allowance is used
 * up, or it answers 401/402/403/429, the chain moves to the next one. Nothing here can spend money:
 * providers are only used while their free allowance lasts.
 */

export interface AdQuery {
  /** Facebook page id (brand) OR keyword. */
  pageId?: string;
  q?: string;
  country?: string;
  limit: number;
  /** The brand's website domain (some providers look brands up by domain). */
  domain?: string | null;
}

export interface ProviderResult {
  items: unknown[];
  /** Requests / credits consumed (what the free allowance is measured in). */
  units: number;
}

export interface MetaAdsProvider {
  id: string;
  label: string;
  envKey: string;
  /** Free allowance in units, per period. */
  free: { units: number; period: "month" | "lifetime" };
  fetchAds(apiKey: string, q: AdQuery): Promise<ProviderResult>;
  /** Optional custom availability check (e.g. a USD-denominated free credit). */
  available?(db: Queryable, q: AdQuery): Promise<boolean>;
  /** USD charged per unit (0 for request-count free tiers). */
  usdPerUnit?: number;
  /** Units one page costs (default 1). */
  pageCost?: number;
  /** Ledger provider the usage is billed to (defaults to id), so actors can share one budget. */
  ledgerProvider?: string;
}

/** Max pages a provider will walk for one query (each page ≈ 25–30 ads). */
const maxPages = (limit: number) => Math.min(15, Math.ceil(limit / 25) + 1);

const firstArray = (obj: unknown, keys: string[]): unknown[] => {
  if (!obj || typeof obj !== "object") return [];
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v;
  }
  return [];
};

const retry = { retries: 2, baseMs: 1500, isRetryable: (e: unknown) => e instanceof HttpError && e.status >= 500 };

/** SerpApi: engine=meta_ad_library, ~30 ads per search, 250 free searches / month. */
export const serpApiProvider: MetaAdsProvider = {
  id: "serpapi",
  label: "SerpApi",
  envKey: "SERPAPI_API_KEY",
  free: { units: 250, period: "month" },
  async fetchAds(apiKey, q) {
    const items: unknown[] = [];
    let units = 0;
    let token: string | undefined;
    do {
      const p = new URLSearchParams({ engine: "meta_ad_library", active_status: "active", country: q.country ?? "ALL", api_key: apiKey });
      if (q.pageId) p.set("page_id", q.pageId);
      if (q.q) p.set("q", q.q);
      if (token) p.set("next_page_token", token);
      const res = await withRetry(() => fetchJson<Record<string, unknown>>(`https://serpapi.com/search.json?${p}`, { timeoutMs: 60_000 }), retry);
      units++;
      if (typeof res.error === "string" && !firstArray(res, ["ads"]).length) {
        if (/run out|limit|quota/i.test(res.error)) throw new HttpError(429, res.error);
        break;
      }
      items.push(...firstArray(res, ["ads"]));
      token = ((res.serpapi_pagination as Record<string, unknown> | undefined)?.next_page_token as string | undefined) ?? undefined;
    } while (token && items.length < q.limit && units < maxPages(q.limit));
    return { items: items.slice(0, q.limit), units };
  },
};

/** SearchAPI.io: engine=meta_ad_library, Meta's raw ad shape, 100 free requests. */
export const searchApiProvider: MetaAdsProvider = {
  id: "searchapi",
  label: "SearchAPI.io",
  envKey: "SEARCHAPI_API_KEY",
  free: { units: 100, period: "lifetime" },
  async fetchAds(apiKey, q) {
    const items: unknown[] = [];
    let units = 0;
    let token: string | undefined;
    do {
      const p = new URLSearchParams({ engine: "meta_ad_library", active_status: "active", country: q.country ?? "ALL" });
      if (q.pageId) p.set("page_id", q.pageId);
      if (q.q) p.set("q", q.q);
      if (token) p.set("next_page_token", token);
      const res = await withRetry(
        () => fetchJson<Record<string, unknown>>(`https://www.searchapi.io/api/v1/search?${p}`, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 60_000 }),
        retry,
      );
      units++;
      items.push(...firstArray(res, ["ads"]));
      token = ((res.pagination as Record<string, unknown> | undefined)?.next_page_token as string | undefined) ?? undefined;
    } while (token && items.length < q.limit && units < maxPages(q.limit));
    return { items: items.slice(0, q.limit), units };
  },
};

interface SocialCrawlPost {
  id: string;
  content?: { text?: string | null; media_urls?: string[] | null; thumbnail_url?: string | null };
  author?: { display_name?: string | null; avatar_url?: string | null };
  published_at?: string | null;
  ext?: { ad?: Record<string, unknown> };
}

/** SocialCrawl's normalized post → the raw Meta Ad Library shape our normalizer reads. */
export function fromSocialCrawl(post: SocialCrawlPost): Record<string, unknown> {
  const ad = post.ext?.ad ?? {};
  const hd = (ad.video_hd_url as string | null) ?? null;
  const sd = (ad.video_sd_url as string | null) ?? null;
  const thumb = post.content?.thumbnail_url ?? null;
  const rawMedia: unknown = post.content?.media_urls;
  const media = (Array.isArray(rawMedia) ? rawMedia : typeof rawMedia === "string" ? [rawMedia] : []).filter((u): u is string => typeof u === "string");
  const isVideo = !!(hd || sd);
  return {
    ad_archive_id: post.id,
    page_id: ad.page_id ?? null,
    page_name: post.author?.display_name ?? null,
    is_active: ad.is_active ?? true,
    start_date: post.published_at ?? null,
    end_date: ad.end_date_iso ?? null,
    publisher_platform: ad.publisher_platforms ?? [],
    targeted_or_reached_countries: ad.targeted_or_reached_countries ?? [],
    snapshot: {
      body: { text: post.content?.text ?? null },
      title: ad.title ?? null,
      caption: ad.caption ?? null,
      cta_text: ad.cta_text ?? null,
      cta_type: ad.cta_type ?? null,
      link_url: ad.link_url ?? null,
      display_format: ad.display_format ?? (isVideo ? "VIDEO" : media.length > 1 ? "CAROUSEL" : "IMAGE"),
      page_name: post.author?.display_name ?? null,
      page_profile_picture_url: post.author?.avatar_url ?? null,
      page_profile_uri: ad.page_profile_uri ?? null,
      page_like_count: ad.page_like_count ?? null,
      page_categories: ad.page_categories ?? [],
      images: isVideo ? [] : media.map((u) => ({ original_image_url: u, resized_image_url: u })),
      videos: isVideo ? [{ video_hd_url: hd, video_sd_url: sd, video_preview_image_url: thumb }] : [],
    },
  };
}

/**
 * ScrapeCreators-style Facebook Ad Library API (ScrapeCreators itself, and SocialCrawl which mirrors its
 * parameters inside a { data, pagination } envelope).
 */
function scrapeCreatorsLike(cfg: { id: string; label: string; envKey: string; base: string; segment: string; free: number; creditsPerPage: number }): MetaAdsProvider {
  return {
    id: cfg.id,
    label: cfg.label,
    envKey: cfg.envKey,
    free: { units: cfg.free, period: "lifetime" },
    pageCost: cfg.creditsPerPage,
    async fetchAds(apiKey, q) {
      const items: unknown[] = [];
      let units = 0;
      let pages = 0;
      let cursor: string | undefined;
      do {
        const p = new URLSearchParams({ status: "ACTIVE", country: q.country ?? "ALL" });
        let path: string;
        if (q.pageId) {
          p.set("pageId", q.pageId);
          path = `/v1/facebook/${cfg.segment}/company/ads`;
        } else {
          p.set("query", q.q ?? "");
          path = `/v1/facebook/${cfg.segment}/search/ads`;
        }
        if (cursor) p.set("cursor", cursor);
        const res = await withRetry(() => fetchJson<Record<string, unknown>>(`${cfg.base}${path}?${p}`, { headers: { "x-api-key": apiKey }, timeoutMs: 90_000 }), retry);
        pages++;
        units += typeof res.credits_used === "number" ? res.credits_used : typeof res.credits_charged === "number" ? res.credits_charged : cfg.creditsPerPage;
        const data = res.data && typeof res.data === "object" && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
        const list = firstArray(res, ["results", "searchResults", "ads", "data"]);
        const page = list.length ? list : firstArray(data, ["results", "searchResults", "ads", "items"]);
        // SocialCrawl wraps each ad as { post, computed } in its own schema: map it back to Meta's raw shape.
        items.push(...page.map((it) => (it && typeof it === "object" && "post" in it && (it as { post: unknown }).post ? fromSocialCrawl((it as { post: SocialCrawlPost }).post) : it)));
        const pag = (res.pagination ?? data?.pagination) as Record<string, unknown> | undefined;
        const next = res.cursor ?? data?.cursor ?? pag?.next_cursor;
        cursor = typeof next === "string" && next && pag?.has_more !== false ? next : undefined;
      } while (cursor && items.length < q.limit && pages < maxPages(q.limit));
      return { items: items.slice(0, q.limit), units };
    },
  };
}

/** ScrapeCreators: 1 credit per page, 100 free credits. */
export const scrapeCreatorsProvider = scrapeCreatorsLike({ id: "scrapecreators", label: "ScrapeCreators", envKey: "SCRAPECREATORS_API_KEY", base: "https://api.scrapecreators.com", segment: "adLibrary", free: 100, creditsPerPage: 1 });

/** SocialCrawl: 5 credits per page, 100 free credits (≈20 pages). */
export const socialCrawlProvider = scrapeCreatorsLike({ id: "socialcrawl", label: "SocialCrawl", envKey: "SOCIALCRAWL_API_KEY", base: "https://www.socialcrawl.dev", segment: "adlibrary", free: 100, creditsPerPage: 5 });

/**
 * Adyntel: looks a brand up by its website domain and returns Meta's raw ad objects (~10 creatives per
 * page, 1 credit per page, 50 free credits). Needs ADYNTEL_EMAIL too. Keyword searches are skipped.
 */
export const adyntelProvider: MetaAdsProvider = {
  id: "adyntel",
  label: "Adyntel",
  envKey: "ADYNTEL_API_KEY",
  free: { units: 50, period: "lifetime" },
  async fetchAds(apiKey, q) {
    const email = process.env.ADYNTEL_EMAIL;
    // Not applicable (no domain / keyword search): throw so the chain moves on instead of treating it as "no ads".
    if (!email || !q.domain || !q.pageId) throw new HttpError(400, "adyntel needs a brand domain");
    const items: unknown[] = [];
    let units = 0;
    let token: string | null = null;
    do {
      const res = await fetch("https://api.adyntel.com/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, email, company_domain: q.domain.replace(/^www./, ""), ...(token ? { continuation_token: token } : {}) }),
        signal: AbortSignal.timeout(150_000),
      });
      if (res.status === 204) break; // no ads (not charged)
      if (!res.ok) throw new HttpError(res.status, `adyntel ${res.status}`);
      units++;
      const j = (await res.json()) as { page_id?: string; results?: unknown[][]; continuation_token?: string | null };
      // A domain can map to another page than the one we asked for: only keep the right brand.
      if (j.page_id && String(j.page_id) !== q.pageId) break;
      for (const group of j.results ?? []) items.push(...(Array.isArray(group) ? group : [group]));
      token = j.continuation_token ?? null;
    } while (token && items.length < q.limit && units < maxPages(q.limit));
    return { items: items.slice(0, q.limit), units };
  },
};

/**
 * Apify actors as the last resorts: paid per ad, but only while the free monthly Apify credit lasts
 * (budget in provider_budgets.apify). All of them share that one budget (ledger provider "apify").
 */
function apifyActorProvider(actorId: string, id: string, label: string): MetaAdsProvider {
  const spec = APIFY_ACTORS[actorId]!;
  return {
    id,
    label,
    envKey: "APIFY_TOKEN",
    ledgerProvider: "apify",
    free: { units: 1_000_000, period: "month" },
    usdPerUnit: spec.pricePerAdUsd,
    async available(db, q) {
      const [row] = await db.query<{ spent: string | number; budget: string | number | null }>(
        "select coalesce((select sum(usd) from public.cost_ledger where provider = 'apify' and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'), 0) as spent, (select monthly_usd from public.provider_budgets where provider = 'apify') as budget",
      );
      return Number(row?.spent ?? 0) + q.limit * spec.pricePerAdUsd + spec.startFeeUsd <= Number(row?.budget ?? 0);
    },
    async fetchAds(token, q) {
      const query = { pageId: q.pageId ?? "", term: q.q ?? "", country: q.country ?? "ALL", limit: q.limit };
      const input = q.pageId ? spec.pageInput(query) : spec.keywordInput(query);
      const cap = Math.max(0.05, q.limit * spec.pricePerAdUsd * 1.3 + spec.startFeeUsd).toFixed(2);
      const start = await fetchJson<{ data: { id: string } }>(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs?maxTotalChargeUsd=${cap}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      let run = start.data as { id: string; status?: string; defaultDatasetId?: string };
      for (let i = 0; i < 40 && !["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(run.status ?? ""); i++) {
        run = (await fetchJson<{ data: typeof run }>(`https://api.apify.com/v2/actor-runs/${run.id}?waitForFinish=30`, { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 60_000 })).data;
      }
      if (run.status !== "SUCCEEDED") throw new HttpError(502, `Apify ${actorId} run ${run.status}`);
      const items = run.defaultDatasetId ? await fetchJson<unknown[]>(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, { headers: { Authorization: `Bearer ${token}` } }) : [];
      return { items, units: items.length };
    },
  };
}

export const apifyProvider = apifyActorProvider("curious_coder/facebook-ads-library-scraper", "apify", "Apify · curious_coder");
export const apifyAutomlyProvider = apifyActorProvider("automly/facebook-ad-library-scraper", "apify-automly", "Apify · automly");
export const apifyOfficialProvider = apifyActorProvider("apify/facebook-ads-scraper", "apify-official", "Apify · official scraper");

export const FALLBACK_PROVIDERS: MetaAdsProvider[] = [serpApiProvider, metapiProvider, searchApiProvider, scrapeCreatorsProvider, socialCrawlProvider, socialFetchProvider, parseBotProvider, adspoProvider, adyntelProvider, apifyProvider, apifyAutomlyProvider, apifyOfficialProvider, brightDataProvider];

export async function providerUsage(db: Queryable, p: MetaAdsProvider): Promise<number> {
  const since = p.free.period === "month" ? "date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'" : "'-infinity'::timestamptz";
  const [row] = await db.query<{ units: string | number }>(`select coalesce(sum(units), 0) as units from public.cost_ledger where provider = $1 and created_at >= ${since}`, [p.id]);
  return Number(row?.units ?? 0);
}

export interface ChainResult {
  ads: NormalizedAd[];
  provider: string | null;
  tried: { provider: string; outcome: string }[];
}

/**
 * Tries each configured provider in order until one returns ads. Usage is logged at $0 against the
 * provider's free allowance; providers that are used up or reject the key are skipped.
 */
export async function fetchWithFallback(
  db: Queryable,
  q: AdQuery,
  opts: { env?: Record<string, string | undefined>; providers?: MetaAdsProvider[]; jobId?: string | null } = {},
): Promise<ChainResult> {
  const env = opts.env ?? process.env;
  const tried: ChainResult["tried"] = [];
  for (const p of opts.providers ?? FALLBACK_PROVIDERS) {
    const key = env[p.envKey];
    if (!key) {
      tried.push({ provider: p.id, outcome: "not configured" });
      continue;
    }
    if (p.available) {
      if (!(await p.available(db, q))) {
        tried.push({ provider: p.id, outcome: "free credit used" });
        continue;
      }
    } else {
      const used = await providerUsage(db, p);
      // Worst case a call walks every page; stop before crossing the free allowance.
      if (used + maxPages(q.limit) * (p.pageCost ?? 1) > p.free.units) {
        tried.push({ provider: p.id, outcome: `free allowance used (${used}/${p.free.units})` });
        continue;
      }
    }
    try {
      const { items, units } = await p.fetchAds(key, q);
      await db.query("insert into public.cost_ledger (provider, operation, units, usd, job_id, meta) values ($1, $2, $3, $4, $5, $6::text::jsonb)", [
        p.ledgerProvider ?? p.id,
        q.pageId ? "page-ads" : "keyword-search",
        units,
        Math.round(units * (p.usdPerUnit ?? 0) * 1e6) / 1e6,
        opts.jobId ?? null,
        JSON.stringify({ free_tier: true, via: p.id, pageId: q.pageId ?? null, q: q.q ?? null, items: items.length }),
      ]);
      const ads = items.map((it) => normalizeAdLibraryItem(it, { source: "meta_ad_library", country: q.country })).filter((a): a is NormalizedAd => a !== null);
      // A successful answer is authoritative even when empty (the page simply has no active ads):
      // don't spend other providers' free credits asking again.
      return { ads, provider: p.id, tried: [...tried, { provider: p.id, outcome: ads.length ? `ok (${ads.length} ads, ${units} units)` : "ok (no active ads)" }] };
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      tried.push({ provider: p.id, outcome: status ? `HTTP ${status}` : `error: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}` });
      // 401/402/403/429: key invalid or quota gone; anything else: also try the next provider.
    }
  }
  return { ads: [], provider: null, tried };
}
