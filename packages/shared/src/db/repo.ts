import type { NormalizedAd, NormalizedBrand } from "../types.ts";
import type { Queryable } from "./client.ts";

/**
 * Idempotent ingestion. Everything is an upsert keyed on natural keys:
 *   brands: (platform, platform_page_id)    ads: (source, source_ad_id)
 * Re-running a job with the same data never creates duplicates; it refreshes last_seen_at.
 * Batches go through jsonb_to_recordset so one round-trip handles hundreds of rows.
 */

export interface BrandUpsertResult {
  idByPageId: Map<string, string>;
  inserted: number;
  newPageIds: string[];
}

export async function upsertBrands(db: Queryable, brands: (NormalizedBrand & { countries?: string[] })[]): Promise<BrandUpsertResult> {
  // Collapse duplicates within the batch (same page appears on many ads).
  const byKey = new Map<string, NormalizedBrand & { countries: string[] }>();
  for (const b of brands) {
    const key = `${b.platform}:${b.platformPageId}`;
    const prev = byKey.get(key);
    const countries = [...new Set([...(prev?.countries ?? []), ...(b.countries ?? [])])].sort();
    byKey.set(key, { ...prev, ...b, logoUrl: b.logoUrl ?? prev?.logoUrl ?? null, countries });
  }
  if (!byKey.size) return { idByPageId: new Map(), inserted: 0, newPageIds: [] };

  const rows = [...byKey.values()].map((b) => ({
    platform: b.platform,
    platform_page_id: b.platformPageId,
    name: b.name,
    logo_url: b.logoUrl ?? null,
    countries: b.countries,
    page_likes: b.likes ?? null,
    page_category: b.category ?? null,
  }));

  const result = await db.query<{ id: string; platform_page_id: string; inserted: boolean }>(
    `insert into public.brands as b (platform, platform_page_id, name, logo_url, countries, page_likes, page_category, quality)
     select x.platform, x.platform_page_id, x.name, x.logo_url, coalesce(x.countries, '{}'), x.page_likes, x.page_category,
            'unknown'
     from jsonb_to_recordset($1::text::jsonb) as x(platform text, platform_page_id text, name text, logo_url text, countries text[],
       page_likes int, page_category text)
     on conflict (platform, platform_page_id) do update set
       name          = case when b.is_curated then b.name else excluded.name end,
       logo_url      = coalesce(excluded.logo_url, b.logo_url),
       countries     = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(b.countries || excluded.countries) as c),
       page_likes    = coalesce(excluded.page_likes, b.page_likes),
       page_category = coalesce(excluded.page_category, b.page_category),
       quality       = case when b.is_curated or b.status = 'tracked' then 'brand' else b.quality end,
       last_seen_at  = now()
     returning coalesce(b.merged_into, b.id) as id, b.platform_page_id, (xmax = 0) as inserted`,
    [JSON.stringify(rows)],
  );

  const idByPageId = new Map(result.map((r) => [r.platform_page_id, r.id]));
  const newPageIds = result.filter((r) => r.inserted).map((r) => r.platform_page_id);
  return { idByPageId, inserted: newPageIds.length, newPageIds };
}

/** Feed preview: poster/first image + first video URL from the source CDN. */
export function previewOf(a: NormalizedAd): { thumbnail_url: string | null; video_url: string | null; media_count: number } {
  const video = a.media.find((m) => m.type === "video");
  const image = a.media.find((m) => m.type === "image");
  return { thumbnail_url: video?.previewUrl ?? image?.url ?? null, video_url: video?.url ?? null, media_count: a.media.length };
}

export interface AdUpsertResult {
  inserted: number;
  updated: number;
  newBrands: number;
  newBrandPageIds: string[];
}

export async function upsertAds(db: Queryable, ads: NormalizedAd[]): Promise<AdUpsertResult> {
  // Same ad can appear twice in one batch (e.g. two keywords): keep the last occurrence.
  const unique = new Map<string, NormalizedAd>();
  for (const ad of ads) unique.set(`${ad.source}:${ad.sourceAdId}`, ad);
  const list = [...unique.values()];
  if (!list.length) return { inserted: 0, updated: 0, newBrands: 0, newBrandPageIds: [] };

  const brands = await upsertBrands(
    db,
    list.flatMap((a) => (a.brand ? [{ ...a.brand, countries: a.countries }] : [])),
  );

  const rows = list.map((a) => ({
    source: a.source,
    source_ad_id: a.sourceAdId,
    brand_id: a.brand ? (brands.idByPageId.get(a.brand.platformPageId) ?? null) : null,
    platforms: a.platforms,
    format: a.format,
    body_text: a.bodyText,
    headline: a.headline,
    description: a.description,
    cta: a.cta,
    landing_url: a.landingUrl,
    landing_domain: a.landingDomain,
    countries: a.countries,
    start_date: a.startDate,
    end_date: a.endDate,
    is_active: a.isActive,
    creative_hash: a.creativeHash,
    collation_id: a.collationId,
    variations_count: a.variationsCount,
    raw: a.raw ?? null,
    ...previewOf(a),
  }));

  const result = await db.query<{ inserted: boolean }>(
    `insert into public.ads as a (
       source, source_ad_id, brand_id, platforms, format, body_text, headline, description, cta,
       landing_url, landing_domain, countries, start_date, end_date, is_active, creative_hash,
       collation_id, variations_count, raw, thumbnail_url, video_url, media_count)
     select x.source, x.source_ad_id, x.brand_id, coalesce(x.platforms, '{}'), coalesce(x.format, 'unknown')::ad_format,
            x.body_text, x.headline, x.description, x.cta, x.landing_url, x.landing_domain, coalesce(x.countries, '{}'),
            x.start_date, x.end_date, coalesce(x.is_active, true), x.creative_hash, x.collation_id,
            greatest(coalesce(x.variations_count, 1), 1), x.raw, x.thumbnail_url, x.video_url, coalesce(x.media_count, 0)
     from jsonb_to_recordset($1::text::jsonb) as x(
       source text, source_ad_id text, brand_id uuid, platforms text[], format text, body_text text, headline text,
       description text, cta text, landing_url text, landing_domain text, countries text[], start_date date,
       end_date date, is_active boolean, creative_hash text, collation_id text, variations_count int, raw jsonb,
       thumbnail_url text, video_url text, media_count int)
     on conflict (source, source_ad_id) do update set
       brand_id         = coalesce(excluded.brand_id, a.brand_id),
       platforms        = (select coalesce(array_agg(distinct p order by p), '{}') from unnest(a.platforms || excluded.platforms) as p),
       format           = case when excluded.format = 'unknown' then a.format else excluded.format end,
       body_text        = coalesce(excluded.body_text, a.body_text),
       headline         = coalesce(excluded.headline, a.headline),
       description      = coalesce(excluded.description, a.description),
       cta              = coalesce(excluded.cta, a.cta),
       landing_url      = coalesce(excluded.landing_url, a.landing_url),
       landing_domain   = coalesce(excluded.landing_domain, a.landing_domain),
       countries        = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(a.countries || excluded.countries) as c),
       start_date       = coalesce(a.start_date, excluded.start_date),
       end_date         = excluded.end_date,
       is_active        = excluded.is_active,
       creative_hash    = coalesce(excluded.creative_hash, a.creative_hash),
       collation_id     = coalesce(excluded.collation_id, a.collation_id),
       variations_count = greatest(a.variations_count, excluded.variations_count),
       raw              = coalesce(excluded.raw, a.raw),
       thumbnail_url    = coalesce(excluded.thumbnail_url, a.thumbnail_url),
       video_url        = coalesce(excluded.video_url, a.video_url),
       media_count      = greatest(a.media_count, excluded.media_count),
       last_seen_at     = now()
     returning (xmax = 0) as inserted`,
    [JSON.stringify(rows)],
  );

  const inserted = result.filter((r) => r.inserted).length;
  return { inserted, updated: result.length - inserted, newBrands: brands.inserted, newBrandPageIds: brands.newPageIds };
}

// ---------------------------------------------------------------- job runs

export async function startJobRun(db: Queryable, jobName: string, jobId: string | null): Promise<number> {
  const [row] = await db.query<{ id: number }>("insert into public.job_runs (job_name, job_id) values ($1, $2) returning id", [jobName, jobId]);
  return Number(row!.id);
}

export async function finishJobRun(db: Queryable, runId: number, outcome: { status: "succeeded" | "failed"; stats?: Record<string, unknown>; error?: string | null }): Promise<void> {
  await db.query("update public.job_runs set status = $2::job_status, finished_at = now(), stats = $3::text::jsonb, error = $4 where id = $1", [
    runId,
    outcome.status,
    JSON.stringify(outcome.stats ?? {}),
    outcome.error ? outcome.error.slice(0, 4000) : null,
  ]);
}
