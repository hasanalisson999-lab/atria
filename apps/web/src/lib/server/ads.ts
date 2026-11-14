import "server-only";
import { CATEGORY_IDS, normalizeAdLibraryItem } from "@signal/shared";
import { EMBED_MODEL, toVector, voyageEmbed } from "@signal/shared/ai";
import { fromPostgresJs } from "@signal/shared/db";
import { after } from "next/server";
import { query, type Result } from "./db";

/** Every category (see packages/shared/src/discovery/catalog.ts). */
export const NICHES: readonly string[] = CATEGORY_IDS;
export type Niche = string;
/** "brands" = every vetted real brand; "everything" also includes unvetted advertisers. */
export type NicheTab = string;
export const FEED_FORMATS = ["video", "image", "carousel", "dco"] as const;
export type FeedSort = "fresh" | "newest" | "longest" | "variations";

/** A new feed seed: base36 timestamp, so "seen before this visit" can be told apart from "seen during it". */
export const newFeedSeed = () => Date.now().toString(36);

export interface FeedParams {
  niche: NicheTab;
  q?: string;
  sort?: FeedSort;
  format?: (typeof FEED_FORMATS)[number];
  active?: boolean;
  minDays?: number;
  brandId?: string;
  /** Only brands the user tracks. */
  trackedOnly?: boolean;
  limit?: number;
  offset?: number;
  /** Mix brands round-robin so one brand can't flood the feed (default on unless filtering to one brand). */
  diverse?: boolean;
  /** Two-letter country the ad was shown in (where the Ad Library discloses it). */
  country?: string;
  /** Price range from the ad copy, in the ad's currency. */
  priceMin?: number;
  priceMax?: number;
  /** Only newer / less mainstream brands. */
  challengers?: boolean;
  /** "fresh" sort: per-visit seed. Same seed = same order (so "Load more" continues the same batch). */
  seed?: string;
  /** Personalization from your brand profile: competitors first, your price band and keywords lean in. */
  fit?: FeedFit;
}

export interface FeedFit {
  brandIds: string[];
  priceMin: number;
  priceMax: number;
  /** websearch_to_tsquery text, e.g. "running OR cushioning". */
  terms: string | null;
}

export interface FeedAd {
  id: string;
  source_ad_id: string;
  format: string;
  body_text: string | null;
  headline: string | null;
  cta: string | null;
  landing_url: string | null;
  landing_domain: string | null;
  start_date: string | null;
  is_active: boolean;
  days_running: number | null;
  variations_count: number;
  platforms: string[];
  thumbnail_url: string | null;
  video_url: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_logo: string | null;
  brand_logo_small: string | null;
  brand_status: string | null;
  has_analysis: boolean;
  /** Extra images for carousel / dynamic ads (first is the thumbnail). */
  gallery: string[];
  /** How many ads share this exact creative (visual duplicates collapsed into this tile). */
  variants: number;
}

/** 400px page picture (public Graph endpoint, no token) instead of the 60px thumbnail from the Ad Library. */
export const LOGO_SQL = `case when b.platform = 'meta' then 'https://graph.facebook.com/' || b.platform_page_id || '/picture?type=large&width=400&height=400' else b.logo_url end`;
export const hiResLogo = (pageId: string | null, fallback: string | null) => (pageId ? `https://graph.facebook.com/${pageId}/picture?type=large&width=400&height=400` : fallback);

const AD_COLUMNS = `a.id, a.source_ad_id, a.format::text as format, a.body_text, a.headline, a.cta, a.landing_url, a.landing_domain,
  a.start_date::text as start_date, a.is_active, a.days_running, a.variations_count, a.platforms, a.thumbnail_url, a.video_url,
  b.id as brand_id, b.name as brand_name, ${LOGO_SQL} as brand_logo, b.logo_url as brand_logo_small, b.status::text as brand_status,
  exists(select 1 from public.ad_analysis x join public.ads s on s.id = x.ad_id where s.id = a.id or (a.creative_group is not null and s.creative_group = a.creative_group)) as has_analysis`;

/** Same as AD_COLUMNS minus the analysis lookup, which getFeed does only for the rows it returns. */
const AD_COLUMNS_LITE = AD_COLUMNS.slice(0, AD_COLUMNS.indexOf("exists(")).replace(/,\s*$/, "");

/** One tile per creative: visual duplicates (same brand, near-identical thumbnail) share a group. */
const GROUP = "coalesce(a.creative_group, a.id::text)";

export function getFeed(p: FeedParams): Promise<Result<{ ads: FeedAd[]; total: number }>> {
  return query(async (sql) => {
    const q = p.q?.trim();
    const where = sql`
      where coalesce(b.status::text, '') <> 'ignored'
      ${p.niche === "everything" ? sql`` : q ? sql`and (b.quality = 'brand' or b.page_likes >= 100000)` : sql`and b.quality = 'brand'`}
      ${NICHES.includes(p.niche) ? sql`and b.category = ${p.niche}` : sql``}
      ${p.brandId ? sql`and a.brand_id = ${p.brandId}` : sql``}
      ${p.trackedOnly ? sql`and b.status = 'tracked'` : sql``}
      ${p.format ? sql`and a.format = ${p.format}::ad_format` : sql``}
      ${p.active ? sql`and a.is_active` : sql``}
      ${p.minDays ? sql`and a.days_running >= ${p.minDays}` : sql``}
      ${p.country && /^[A-Z]{2}$/.test(p.country) ? sql`and ${p.country} = any(a.countries)` : sql``}
      ${p.priceMin != null ? sql`and a.price >= ${p.priceMin}` : sql``}
      ${p.priceMax != null ? sql`and a.price < ${p.priceMax}` : sql``}
      ${p.challengers ? sql`and b.tier = 'challenger'` : sql``}
      ${q ? sql`and (a.search_tsv @@ websearch_to_tsquery('simple', ${q}) or b.name ilike ${"%" + q + "%"} or a.landing_domain ilike ${"%" + q + "%"})` : sql``}`;
    const seed = p.seed && /^[0-9a-z]{4,12}$/.test(p.seed) ? p.seed : newFeedSeed();
    const fit = p.fit;
    const fitIds = (fit?.brandIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 40);
    const fitSql = fit
      ? sql`* (case when a.price is null then 1 when a.price between ${fit.priceMin} and ${fit.priceMax} then 0.75 else 1.2 end)
           ${fit.terms ? sql`* (case when a.search_tsv @@ websearch_to_tsquery('simple', ${fit.terms}) then 0.75 else 1 end)` : sql``}`
      : sql``;
    const seedAt = new Date(Math.min(parseInt(seed, 36) || Date.now(), Date.now()));
    const fresh = p.sort === "fresh";
    // Plain SQL text (no parameters), reused on the inner and outer query.
    const orderText = fresh
      ? "x.seen, x.fitrank, x.weak, x.rnd, x.id"
      : p.sort === "longest"
        ? "x.days_running desc nulls last, x.id"
        : p.sort === "variations"
          ? "x.variants desc, x.variations_count desc, x.days_running desc nulls last, x.id"
          : "x.start_date desc nulls last, x.id";
    const order = sql.unsafe(orderText);
    const limit = Math.min(Math.max(p.limit ?? 48, 1), 240);
    const diverse = (p.diverse ?? true) && !p.brandId;
    // Representative per creative: active first, then newest, then longest running.
    // Diverse mode deals ads out round-robin: round 1 = every brand's best ad (in sort order), round 2 = every
    // brand's second-best, and so on, so the feed shows many brands instead of one brand's back catalogue.
    const countP = sql<{ n: number }[]>`select count(distinct ${sql.unsafe(GROUP)})::int as n from public.ads a left join public.brands b on b.id = a.brand_id ${where}`;
    const rows = await sql<(Omit<FeedAd, "gallery"> & { raw: unknown; rn: number; br: number })[]>`
      select y.*, case when y.format in ('carousel', 'dco') then (select r.raw from public.ads r where r.id = y.id) end as raw,
             exists(select 1 from public.ad_analysis an join public.ads s on s.id = an.ad_id where coalesce(s.creative_group, s.id::text) = y.grp) as has_analysis
      from (select * from (
        select x.*, row_number() over (partition by coalesce(x.brand_id::text, x.id::text) order by ${order}) as br
        from (
          select ${sql.unsafe(AD_COLUMNS_LITE)},
                 ${sql.unsafe(GROUP)} as grp,
                 (count(*) over (partition by ${sql.unsafe(GROUP)}))::int as variants,
                 row_number() over (partition by ${sql.unsafe(GROUP)} order by a.is_active desc, a.start_date desc nulls last, a.days_running desc nulls last, a.id) as rn,
                 -- Fresh mix: shown before this visit (last 4 days) sinks; otherwise a seeded shuffle that leans
                 -- towards proven winners and brand-new launches.
                 (case when exists (select 1 from public.feed_impressions fi where fi.grp = ${sql.unsafe(GROUP)}
                                    and fi.shown_at < ${seedAt} and fi.shown_at > ${seedAt}::timestamptz - interval '4 days') then 1 else 0 end) as seen,
                 (case when a.brand_id = any(${fitIds}::uuid[]) then 0 else 1 end) as fitrank,
                 (abs(hashtext(a.id::text || ${seed})) % 1000)::float
                   ${fitSql}
                   * (case when a.days_running >= 30 then 0.6 else 1 end)
                   * (case when a.start_date >= current_date - 14 then 0.7 else 1 end) as rnd,
                 -- Ads with a reason to study them (proven, scaled, brand-new) come first; copy-only ads last.
                 -- Catalog (dynamic) ads are product-feed shots, not brand marketing: they go last too.
                 (case when (a.thumbnail_url is null and a.video_url is null) or a.format = 'dco' then 2
                       when a.days_running >= 30 or a.start_date >= current_date - 7 or count(*) over (partition by ${sql.unsafe(GROUP)}) >= 3 then 0 else 1 end) as weak
          from public.ads a left join public.brands b on b.id = a.brand_id
          ${where}
        ) x where x.rn = 1
      ) x
      order by ${diverse ? sql`x.br,` : sql``} ${order} limit ${limit} offset ${Math.max(0, p.offset ?? 0)}) y
      order by ${diverse ? sql`y.br,` : sql``} ${sql.unsafe(orderText.replace(/x./g, "y."))}`;
    if (fresh && rows.length) {
      const grps = rows.map((r) => (r as unknown as { grp: string }).grp);
      // The response doesn't wait for the "seen" bookkeeping, but the platform keeps running until it's written
      // (a bare unawaited query can be frozen mid-flight on Vercel and leave a connection stuck).
      const record = () =>
        sql`insert into public.feed_impressions (grp) select unnest(${grps}::text[])
            on conflict (grp) do update set shown_at = now(), times = public.feed_impressions.times + 1`.then(
          () => undefined,
          () => undefined,
        );
      try {
        after(record);
      } catch {
        void record(); // outside a request (scripts)
      }
    }
    const ads: FeedAd[] = rows.map(({ raw, rn: _rn, br: _br, ...rest }) => {
      void _rn;
      void _br;
      const { grp: _g, seen: _s, rnd: _r, weak: _w, ...ad } = rest as typeof rest & { grp?: string; seen?: number; rnd?: number; weak?: number };
      void _w;
      void _g;
      void _s;
      void _r;
      const media = raw ? (normalizeAdLibraryItem(raw, { source: "meta_ad_library" })?.media ?? []) : [];
      const gallery = media.filter((m) => m.type === "image").map((m) => m.url).slice(0, 8);
      return { ...ad, gallery: gallery.length > 1 ? gallery : [] };
    });
    const [c] = await countP;
    return { ads, total: c?.n ?? 0 };
  });
}

export function getNicheCounts(): Promise<Result<Record<NicheTab, number>>> {
  return query(async (sql) => {
    const rows = await sql<{ category: string | null; quality: string; n: number }[]>`
      select b.category, b.quality, count(distinct ${sql.unsafe(GROUP)})::int as n
      from public.ads a join public.brands b on b.id = a.brand_id
      where b.status <> 'ignored' group by 1, 2`;
    const out: Record<NicheTab, number> = { brands: 0, everything: 0, ...Object.fromEntries(NICHES.map((n) => [n, 0])) };
    for (const r of rows) {
      out.everything! += r.n;
      if (r.quality === "brand") {
        out.brands! += r.n;
        if (r.category && r.category in out) out[r.category]! += r.n;
      }
    }
    return out;
  });
}

export interface BrandChip {
  id: string;
  name: string;
  logo_url: string | null;
  logo_small: string | null;
  ads: number;
  active_ads: number;
}

export function getTopBrands(niche: NicheTab, limit = 24, opts: { challengers?: boolean } = {}): Promise<Result<BrandChip[]>> {
  return query(
    (sql) => sql<BrandChip[]>`
      select b.id, b.name, ${sql.unsafe(LOGO_SQL)} as logo_url, b.logo_url as logo_small, count(distinct ${sql.unsafe(GROUP)})::int as ads,
             (count(distinct ${sql.unsafe(GROUP)}) filter (where a.is_active))::int as active_ads
      from public.brands b join public.ads a on a.brand_id = b.id
      where b.status <> 'ignored'
        ${niche === "everything" ? sql`` : sql`and b.quality = 'brand'`}
        ${NICHES.includes(niche) ? sql`and b.category = ${niche}` : sql``}
        ${opts.challengers ? sql`and b.tier = 'challenger'` : sql``}
      group by b.id order by b.is_curated desc, active_ads desc, ads desc limit ${limit}`,
  );
}

// ---------------------------------------------------------------- ad detail

export interface AdMediaItem {
  type: "image" | "video";
  url: string;
  previewUrl?: string | null;
}

export interface AdAnalysis {
  transcript: string | null;
  hook_text: string | null;
  hook_type: string | null;
  angle: string | null;
  awareness_level: string | null;
  format_tags: string[];
  emotions: string[];
  offer: string | null;
  target_audience: string | null;
  script_breakdown: { start_s: number; end_s: number; visual: string; voiceover?: string; on_screen_text?: string }[] | null;
  why_it_works: string | null;
  takeaway: string | null;
  version: number;
  model: string | null;
  created_at: string;
}

export interface AdVariant {
  id: string;
  headline: string | null;
  body_text: string | null;
  start_date: string | null;
  is_active: boolean;
  countries: string[];
  landing_url: string | null;
  cta: string | null;
}

export interface AdDetail extends FeedAd {
  variant_list: AdVariant[];
  description: string | null;
  countries: string[];
  end_date: string | null;
  first_seen_at: string;
  creative_hash: string | null;
  media: AdMediaItem[];
  analysis: AdAnalysis | null;
  brand_category: string | null;
  brand_likes: number | null;
  /** The brand's own website (e.g. "oneletic.com"): the fallback destination when an ad has no landing page. */
  brand_website: string | null;
  /** "meta" or "tiktok": which public ad library the ad can be opened in. */
  brand_platform: string | null;
  siblings: number;
}

export function getAd(id: string): Promise<Result<AdDetail | null>> {
  return query(async (sql) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await sql<(FeedAd & { description: string | null; countries: string[]; end_date: string | null; first_seen_at: string; creative_hash: string | null; creative_group: string | null; raw: unknown; brand_category: string | null; brand_likes: number | null; brand_website: string | null; brand_platform: string | null })[]>`
      select ${sql.unsafe(AD_COLUMNS)}, a.description, a.countries, a.end_date::text as end_date, a.first_seen_at, a.creative_hash, a.creative_group, a.raw,
             b.category as brand_category, b.page_likes as brand_likes, b.website_domain as brand_website, b.platform::text as brand_platform
      from public.ads a left join public.brands b on b.id = a.brand_id where a.id = ${id}`;
    if (!row) return null;
    // Analysis is shared across the creative group: analyzing one copy covers all duplicates.
    const [analysis] = await sql<AdAnalysis[]>`
      select x.transcript, x.hook_text, x.hook_type, x.angle, x.awareness_level, x.format_tags, x.emotions, x.offer, x.target_audience,
             x.script_breakdown, x.why_it_works, x.takeaway, x.version, x.model, x.created_at
      from public.ad_analysis x join public.ads s on s.id = x.ad_id
      where s.id = ${id} or (${row.creative_group}::text is not null and s.creative_group = ${row.creative_group})
      order by (s.id = ${id}) desc, x.created_at desc limit 1`;
    const variantList = row.creative_group
      ? await sql<AdVariant[]>`
          select id, headline, body_text, start_date::text as start_date, is_active, countries, landing_url, cta
          from public.ads where creative_group = ${row.creative_group} and id <> ${id}
          order by is_active desc, start_date desc nulls last limit 50`
      : [];
    const [sib] = [{ n: variantList.length }];
    const normalized = normalizeAdLibraryItem(row.raw, { source: "meta_ad_library" });
    const { raw: _raw, ...rest } = row;
    void _raw;
    return { ...rest, gallery: [], variants: variantList.length + 1, variant_list: variantList, media: normalized?.media ?? [], analysis: analysis ?? null, siblings: sib?.n ?? 0 };
  });
}

// ---------------------------------------------------------------- brands

export interface BrandListRow {
  id: string;
  name: string;
  logo_url: string | null;
  logo_small: string | null;
  category: string | null;
  status: "discovered" | "tracked" | "ignored";
  quality: string;
  page_likes: number | null;
  is_curated: boolean;
  ads: number;
  active_ads: number;
  longest_days: number | null;
  domain: string | null;
  first_seen_at: string;
  /** Latest creative thumbnails (for the card strip). */
  thumbs: string[];
  /** New unique creatives started in the last 14 days. */
  new_14d: number;
  /** New creatives per week, oldest → newest (8 weeks). */
  spark: number[];
}

export type BrandTab = "tracked" | Niche | "brands" | "unvetted" | "ignored";

export function getBrandList(tab: BrandTab): Promise<Result<BrandListRow[]>> {
  return query(
    (sql) => sql<BrandListRow[]>`
      select b.id, b.name, ${sql.unsafe(LOGO_SQL)} as logo_url, b.logo_url as logo_small, b.category, b.status::text as status, b.quality, b.page_likes, b.is_curated, b.first_seen_at,
             count(distinct ${sql.unsafe(GROUP)})::int as ads,
             (count(distinct ${sql.unsafe(GROUP)}) filter (where a.is_active))::int as active_ads,
             max(a.days_running) as longest_days,
             coalesce(b.website_domain, mode() within group (order by a.landing_domain) filter (where a.landing_domain !~ '(doubleclick|bit\.ly|linksynergy|adjust\.com|onelink|apps\.apple|itunes\.apple|play\.google|app\.link|smart\.link|go\.skimresources|l\.facebook|fb\.me)')) as domain,
             (count(distinct ${sql.unsafe(GROUP)}) filter (where a.start_date >= current_date - 14))::int as new_14d,
             coalesce((select array_agg(t) from (select distinct on (coalesce(x.creative_group, x.id::text)) x.thumbnail_url as t, x.start_date
                        from public.ads x where x.brand_id = b.id and x.thumbnail_url is not null
                        order by coalesce(x.creative_group, x.id::text), x.start_date desc nulls last) z
                       where t is not null limit 3), '{}') as thumbs,
             array(select (select count(distinct coalesce(y.creative_group, y.id::text))::int from public.ads y
                           where y.brand_id = b.id and y.start_date >= current_date - (w * 7 + 7) and y.start_date < current_date - (w * 7))
                   from generate_series(7, 0, -1) w) as spark
      from public.brands b left join public.ads a on a.brand_id = b.id
      where b.merged_into is null and ${
        tab === "tracked"
          ? sql`b.status = 'tracked'`
          : tab === "ignored"
            ? sql`b.status = 'ignored'`
            : tab === "unvetted"
              ? sql`b.quality <> 'brand' and b.status <> 'ignored'`
              : tab === "brands"
                ? sql`b.quality = 'brand' and b.status <> 'ignored'`
                : sql`b.quality = 'brand' and b.category = ${tab} and b.status <> 'ignored'`
      }
      group by b.id
      order by b.is_curated desc, new_14d desc, b.page_likes desc nulls last, active_ads desc, b.name
      limit 300`,
  );
}

export function getBrandCounts(): Promise<Result<Record<BrandTab, number>>> {
  return query(async (sql) => {
    const [r] = await sql<Record<string, number>[]>`
      select count(*) filter (where status = 'tracked')::int as tracked,
             count(*) filter (where quality = 'brand' and status <> 'ignored')::int as brands,
             count(*) filter (where quality <> 'brand' and status <> 'ignored')::int as unvetted,
             count(*) filter (where status = 'ignored')::int as ignored
      from public.brands where merged_into is null`;
    const cats = await sql<{ category: string; n: number }[]>`
      select category, count(*)::int as n from public.brands
      where merged_into is null and quality = 'brand' and status <> 'ignored' and category is not null group by category`;
    return { ...r, ...Object.fromEntries(cats.map((c) => [c.category, c.n])) } as Record<BrandTab, number>;
  });
}

/** Every brand in the library, light (for instant search across all categories). */
export interface BrandIndexRow {
  id: string;
  name: string;
  logo_url: string | null;
  logo_small: string | null;
  category: string | null;
  status: string;
  domain: string | null;
  ads: number;
}
export function getBrandIndex(): Promise<Result<BrandIndexRow[]>> {
  return query(
    (sql) => sql<BrandIndexRow[]>`
      select b.id, b.name, ${sql.unsafe(LOGO_SQL)} as logo_url, b.logo_url as logo_small, b.category, b.status::text as status, b.website_domain as domain,
             (select count(*)::int from public.ads a where a.brand_id = b.id) as ads
      from public.brands b where b.merged_into is null and b.status <> 'ignored' and (b.quality = 'brand' or b.status = 'tracked')
      order by b.name`,
  );
}

export interface BrandDetail extends BrandListRow {
  pages: number;
  collage: string[];
  countries: string[];
  page_category: string | null;
  tracked_at: string | null;
  ads_synced_at: string | null;
  formats: Record<string, number>;
}

export function getBrand(id: string): Promise<Result<BrandDetail | null>> {
  return query(async (sql) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [b] = await sql<BrandDetail[]>`
      select b.id, b.name, ${sql.unsafe(LOGO_SQL)} as logo_url, b.logo_url as logo_small, b.category, b.status::text as status, b.quality, b.page_likes, b.is_curated, b.first_seen_at,
             b.countries, b.page_category, b.tracked_at, b.ads_synced_at,
             ((select count(*) from public.brands m where m.merged_into = b.id) + 1)::int as pages,
             coalesce((select array_agg(t) from (select a2.thumbnail_url as t from public.ads a2 where a2.brand_id = b.id and a2.thumbnail_url is not null order by a2.is_active desc, a2.days_running desc nulls last limit 8) c), '{}') as collage,
             count(a.id)::int as ads, (count(a.id) filter (where a.is_active))::int as active_ads, max(a.days_running) as longest_days,
             coalesce(b.website_domain, mode() within group (order by a.landing_domain) filter (where a.landing_domain !~ '(doubleclick|bit\.ly|linksynergy|adjust\.com|onelink|apps\.apple|itunes\.apple|play\.google|app\.link|smart\.link|go\.skimresources|l\.facebook|fb\.me)')) as domain,
             coalesce(jsonb_object_agg(a.format, 1) filter (where a.id is not null), '{}'::jsonb) as formats
      from public.brands b left join public.ads a on a.brand_id = b.id where b.id = ${id} group by b.id`;
    if (!b) return null;
    const f = await sql<{ format: string; n: number }[]>`select format::text, count(*)::int as n from public.ads where brand_id = ${id} group by 1 order by 2 desc`;
    return { ...b, formats: Object.fromEntries(f.map((x) => [x.format, x.n])) };
  });
}

/** Specific ads by id (boards), keeping the given order. */
export function getAdsByIds(ids: string[]): Promise<Result<FeedAd[]>> {
  return query(async (sql) => {
    const clean = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i));
    if (!clean.length) return [];
    const rows = await sql<(Omit<FeedAd, "gallery" | "variants"> & { raw: unknown; variants: number })[]>`
      select ${sql.unsafe(AD_COLUMNS)}, case when a.format in ('carousel', 'dco') then a.raw end as raw,
             (select count(*)::int from public.ads s where s.creative_group = a.creative_group) as variants
      from public.ads a left join public.brands b on b.id = a.brand_id where a.id in ${sql(clean)}`;
    const byId = new Map(
      rows.map(({ raw, ...ad }) => {
        const media = raw ? (normalizeAdLibraryItem(raw, { source: "meta_ad_library" })?.media ?? []) : [];
        const gallery = media.filter((m) => m.type === "image").map((m) => m.url).slice(0, 8);
        return [ad.id, { ...ad, variants: Math.max(1, ad.variants), gallery: gallery.length > 1 ? gallery : [] } as FeedAd];
      }),
    );
    return clean.map((id) => byId.get(id)).filter((a): a is FeedAd => !!a);
  });
}

const SIM_STOP = new Set(
  "the and for you your with our from this that are was were will just into out off all new now get got its it's not but can has have more most best than then them they their what when who how why yes too very only also one two any".split(" "),
);

/**
 * Ads whose copy is closest to a piece of text (a hook): full-text match on the meaningful words plus trigram
 * similarity of the opening line, nudged towards long-running winners. At most 2 ads per brand for variety.
 */
export function getSimilarToText(text: string, opts: { excludeBrandId?: string | null; onlyBrandId?: string | null; excludeIds?: string[]; limit?: number } = {}): Promise<Result<(FeedAd & { opening: string | null })[]>> {
  return query(async (sql) => {
    const words = [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !SIM_STOP.has(w)))].slice(0, 10);
    const tsq = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "") + ":*").filter((w) => w.length > 2).join(" | ");
    const limit = Math.min(Math.max(opts.limit ?? 12, 1), 48);
    const rows = await sql<(Omit<FeedAd, "gallery"> & { raw: unknown; opening: string | null })[]>`
      select * from (
        select x.*, row_number() over (partition by x.brand_id order by x.score desc) as per_brand from (
          select ${sql.unsafe(AD_COLUMNS)}, case when a.format in ('carousel', 'dco') then a.raw end as raw,
                 1 as variants,
                 coalesce(an.hook_text, split_part(coalesce(a.body_text, a.headline, ''), E'
', 1)) as opening,
                 row_number() over (partition by ${sql.unsafe(GROUP)} order by a.is_active desc, a.days_running desc nulls last) as rn,
                 (case when ${tsq.length > 0} then ts_rank(a.search_tsv, to_tsquery('simple', ${tsq || "x"})) * 2 else 0 end)
                 + extensions.similarity(lower(left(coalesce(an.hook_text, split_part(coalesce(a.body_text, a.headline, ''), E'
', 1)), 200)), lower(${text}))
                 + least(coalesce(a.days_running, 0), 180) / 900.0 as score
          from public.ads a
          join public.brands b on b.id = a.brand_id
          left join public.ad_analysis an on an.ad_id = a.id
          where b.quality = 'brand' and b.status <> 'ignored'
            and (${opts.excludeBrandId ?? null}::uuid is null or a.brand_id <> ${opts.excludeBrandId ?? null}::uuid)
            and (${opts.onlyBrandId ?? null}::uuid is null or a.brand_id = ${opts.onlyBrandId ?? null}::uuid)
            and not (a.id = any(${opts.excludeIds ?? []}::uuid[]))
            and (
              (${tsq.length > 0} and a.search_tsv @@ to_tsquery('simple', ${tsq || "x"}))
              or extensions.similarity(lower(left(coalesce(an.hook_text, split_part(coalesce(a.body_text, a.headline, ''), E'
', 1)), 200)), lower(${text})) > 0.2
            )
        ) x where x.rn = 1
      ) y where y.per_brand <= ${opts.onlyBrandId ? 1000 : 2}
      order by y.score desc limit ${limit}`;
    return rows.map(({ raw, ...ad }) => {
      const r = ad as typeof ad & { rn?: number; per_brand?: number; score?: number };
      delete r.rn;
      delete r.per_brand;
      delete r.score;
      const media = raw ? (normalizeAdLibraryItem(raw, { source: "meta_ad_library" })?.media ?? []) : [];
      const gallery = media.filter((m) => m.type === "image").map((m) => m.url).slice(0, 8);
      return { ...r, gallery: gallery.length > 1 ? gallery : [] };
    });
  });
}

/**
 * Semantic version of getSimilarToText: embeds the text (Voyage free tier, cached) and finds the nearest ad
 * creatives by cosine distance. Falls back to the word-based match when embeddings aren't available.
 */
export async function getSimilarAds(text: string, opts: { excludeBrandId?: string | null; onlyBrandId?: string | null; excludeIds?: string[]; limit?: number } = {}): Promise<Result<(FeedAd & { opening: string | null })[]>> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return getSimilarToText(text, opts);
  const semantic = await query(async (sql) => {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.ad_embeddings`;
    if (n < 50) return null;
    const cacheKey = `emb:${EMBED_MODEL}:${text.trim().toLowerCase().slice(0, 300)}`;
    const [hit] = await sql<{ result: number[] }[]>`select result from public.search_cache where key = ${cacheKey}`;
    let vec = hit?.result ?? null;
    if (!vec) {
      [vec] = await voyageEmbed(key, [text], "query", fromPostgresJs(sql));
      await sql`insert into public.search_cache (key, provider, result) values (${cacheKey}, 'voyage', ${JSON.stringify(vec)}::text::jsonb) on conflict (key) do nothing`;
    }
    const limit = Math.min(Math.max(opts.limit ?? 12, 1), 48);
    const rows = await sql<(Omit<FeedAd, "gallery"> & { raw: unknown; opening: string | null; dist: number })[]>`
      select * from (
        select x.*, row_number() over (partition by x.brand_id order by x.dist) as per_brand from (
          select ${sql.unsafe(AD_COLUMNS)}, case when a.format in ('carousel', 'dco') then a.raw end as raw, 1 as variants,
                 coalesce(an.hook_text, split_part(coalesce(a.body_text, a.headline, ''), E'\n', 1)) as opening,
                 (e.embedding operator(extensions.<=>) ${toVector(vec!)}::extensions.vector) as dist
          from public.ad_embeddings e
          join public.ads a on a.id = e.ad_id
          join public.brands b on b.id = a.brand_id
          left join public.ad_analysis an on an.ad_id = a.id
          where b.quality = 'brand' and b.status <> 'ignored'
            and (${opts.excludeBrandId ?? null}::uuid is null or a.brand_id <> ${opts.excludeBrandId ?? null}::uuid)
            and (${opts.onlyBrandId ?? null}::uuid is null or a.brand_id = ${opts.onlyBrandId ?? null}::uuid)
            and not (a.id = any(${opts.excludeIds ?? []}::uuid[]))
          order by e.embedding operator(extensions.<=>) ${toVector(vec!)}::extensions.vector
          limit 200
        ) x
      ) y where y.per_brand <= ${opts.onlyBrandId ? 1000 : 2} order by y.dist limit ${limit}`;
    return rows.map(({ raw, dist: _d, ...ad }) => {
      void _d;
      const { per_brand: _p, ...r } = ad as typeof ad & { per_brand?: number };
      void _p;
      const media = raw ? (normalizeAdLibraryItem(raw, { source: "meta_ad_library" })?.media ?? []) : [];
      const gallery = media.filter((m) => m.type === "image").map((m) => m.url).slice(0, 8);
      return { ...r, gallery: gallery.length > 1 ? gallery : [] };
    });
  });
  if (semantic.ok && semantic.data) return { ok: true, data: semantic.data };
  return getSimilarToText(text, opts);
}
