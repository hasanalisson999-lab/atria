"use server";

import { CATEGORY_IDS, normName } from "@signal/shared";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { attachPages, findPages, sameBrandPages, syncBrandAds, syncRegistry, type MetaPage, type SyncProgress } from "@/lib/server/brand-sync";
import { getSql, isUnavailable } from "@/lib/server/db";

const LOGO = (alias: string) =>
  `case when ${alias}.platform = 'meta' then 'https://graph.facebook.com/' || ${alias}.platform_page_id || '/picture?type=large&width=200&height=200' else ${alias}.logo_url end`;

export interface SearchBrand {
  id: string;
  name: string;
  logo: string | null;
  logo_small: string | null;
  category: string | null;
  ads: number;
  status: string;
  domain: string | null;
}
export interface SearchAd {
  id: string;
  brand: string | null;
  headline: string | null;
  body: string | null;
  thumbnail_url: string | null;
  format: string;
  days_running: number | null;
}
export interface SearchResults {
  brands: SearchBrand[];
  ads: SearchAd[];
  keywords: string[];
  totalAds: number;
}

/** Live typeahead over the library: brands (name, aliases, domain), ad copy, keywords. */
export async function searchAll(raw: string): Promise<SearchResults> {
  const q = raw.trim().slice(0, 80);
  const empty: SearchResults = { brands: [], ads: [], keywords: [], totalAds: 0 };
  if (q.length < 1) return empty;
  const sql = getSql();
  if (isUnavailable(sql)) return empty;
  const like = `%${q}%`;
  const norm = normName(q);
  const [brands, ads, keywords, total] = await Promise.all([
    sql<SearchBrand[]>`
      select b.id, b.name, ${sql.unsafe(LOGO("b"))} as logo, b.logo_url as logo_small, b.category, b.status::text as status,
             (select count(distinct coalesce(a.creative_group, a.id::text)) from public.ads a where a.brand_id = b.id)::int as ads,
             (select a.landing_domain from public.ads a where a.brand_id = b.id and a.landing_domain is not null limit 1) as domain
      from public.brands b
      where b.status <> 'ignored' and b.merged_into is null and (
        b.name ilike ${like}
        or regexp_replace(lower(b.name), '[^a-z0-9]', '', 'g') like ${"%" + norm + "%"}
        or exists (select 1 from unnest(b.aliases) al where al ilike ${like})
        or exists (select 1 from public.ads a where a.brand_id = b.id and a.landing_domain ilike ${like})
      )
      order by (lower(b.name) = lower(${q})) desc, (b.name ilike ${q + "%"}) desc, b.is_curated desc, b.page_likes desc nulls last
      limit 6`,
    sql<SearchAd[]>`
      select * from (
        select distinct on (coalesce(a.creative_group, a.id::text)) a.id, b.name as brand, a.headline, left(a.body_text, 160) as body, a.thumbnail_url,
               a.format::text as format, a.days_running,
               ts_rank(a.search_tsv, websearch_to_tsquery('simple', ${q})) + (case when a.headline ilike ${like} then 1 else 0 end) as score
        from public.ads a left join public.brands b on b.id = a.brand_id
        where coalesce(b.status::text, '') <> 'ignored'
          and (a.search_tsv @@ websearch_to_tsquery('simple', ${q}) or a.headline ilike ${like} or a.body_text ilike ${like})
        order by coalesce(a.creative_group, a.id::text), a.is_active desc
      ) x order by x.score desc, x.days_running desc nulls last limit 6`,
    sql<{ term: string }[]>`select distinct term from public.keywords where term ilike ${like} order by term limit 4`,
    sql<{ n: number }[]>`
      select count(distinct coalesce(a.creative_group, a.id::text))::int as n from public.ads a
      where a.search_tsv @@ websearch_to_tsquery('simple', ${q}) or a.headline ilike ${like}`,
  ]);
  return { brands, ads, keywords: keywords.map((k) => k.term), totalAds: total[0]?.n ?? 0 };
}

export interface MetaBrandResult {
  name: string;
  pages: MetaPage[];
  likes: number | null;
  verified: boolean;
  image: string | null;
  category: string | null;
  known_brand_id: string | null;
}

/**
 * Finds any real brand on Meta by name (cached; ≤1 free credit per new query). Regional pages with
 * the same name are grouped into one brand result.
 */
export async function searchMetaPages(raw: string): Promise<{ ok: true; brands: MetaBrandResult[]; cached: boolean } | { ok: false; error: string }> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return { ok: false, error: "Type at least 2 characters" };
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  try {
    const { pages, cached } = await findPages(sql, q);
    const groups = new Map<string, MetaPage[]>();
    for (const p of pages) groups.set(normName(p.name), [...(groups.get(normName(p.name)) ?? []), p]);
    const ids = pages.map((p) => p.page_id);
    const known = ids.length
      ? await sql<{ id: string; platform_page_id: string; merged_into: string | null }[]>`select id, platform_page_id, merged_into from public.brands where platform = 'meta' and platform_page_id in ${sql(ids)}`
      : [];
    const brands = [...groups.values()].map((list) => {
      const top = [...list].sort((a, b) => Number(b.verified) - Number(a.verified) || (b.likes ?? 0) - (a.likes ?? 0))[0]!;
      const k = known.find((x) => list.some((p) => p.page_id === x.platform_page_id));
      return {
        name: top.name,
        pages: list,
        likes: top.likes,
        verified: list.some((p) => p.verified),
        image: top.image,
        category: top.category,
        known_brand_id: k ? (k.merged_into ?? k.id) : null,
      };
    });
    brands.sort((a, b) => Number(b.verified) - Number(a.verified) || (b.likes ?? 0) - (a.likes ?? 0));
    return { ok: true, brands: brands.slice(0, 8), cached };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Maps a Facebook page category ("Apparel & Clothing", "Health/Beauty"…) to an Atria category. */
function categoryFromPage(cat: string | null): string | null {
  const c = (cat ?? "").toLowerCase();
  const rules: [RegExp, string][] = [
    [/shoe|footwear|sneaker/, "footwear"],
    [/cloth|apparel|fashion|sportswear|lingerie|swimwear/, "apparel"],
    [/supplement|vitamin|nutrition/, "supplements"],
    [/skin ?care|skin care/, "skincare"],
    [/cosmetic|make ?up|beauty/, "makeup"],
    [/hair/, "haircare"],
    [/fragrance|perfume/, "fragrance"],
    [/jewel|accessor|eyewear|watch|bags/, "accessories"],
    [/fitness|gym|sports equipment|exercise/, "fitness"],
    [/home|furniture|kitchen|bedding|household/, "home"],
    [/food|beverage|drink|grocery/, "food"],
    [/pet/, "pets"],
    [/electronic|computer|software|tech|mobile phone/, "tech"],
    [/health|wellness|medical/, "wellness"],
  ];
  return rules.find(([re]) => re.test(c))?.[1] ?? null;
}

/**
 * Adds a brand with ALL its regional pages, pulls every public active ad through the free fallback
 * chain (SerpApi → SearchAPI → ScrapeCreators → Apify credit), collapses duplicates, and tracks it.
 */
export async function addBrandFromMeta(input: { pages: MetaPage[]; name: string; niche: string | null }): Promise<{ ok: true; brandId: string } | { ok: false; error: string }> {
  const pages = input.pages.filter((p) => /^\d{3,25}$/.test(p.page_id)).slice(0, 12);
  if (!pages.length) return { ok: false, error: "No page selected" };
  const main0 = [...pages].sort((a, b) => Number(b.verified) - Number(a.verified) || (b.likes ?? 0) - (a.likes ?? 0))[0]!;
  // The brand's own Facebook page category decides where it lives; the caller's guess is only a fallback.
  const niche = categoryFromPage(main0.category) ?? (CATEGORY_IDS.includes(input.niche ?? "") ? input.niche : null);
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  const main = [...pages].sort((a, b) => Number(b.verified) - Number(a.verified) || (b.likes ?? 0) - (a.likes ?? 0))[0]!;
  const name = input.name.trim().slice(0, 80) || main.name;
  const [b] = await sql<{ id: string }[]>`
    insert into public.brands (platform, platform_page_id, name, logo_url, page_likes, page_category, quality, is_curated, status, tracked_at, category, aliases)
    values ('meta', ${main.page_id}, ${name}, ${main.image}, ${main.likes}, ${main.category}, 'brand', true, 'tracked', now(), ${niche}, ${[name]})
    on conflict (platform, platform_page_id) do update set name = excluded.name, quality = 'brand', is_curated = true, status = 'tracked', merged_into = null,
      tracked_at = coalesce(public.brands.tracked_at, now()), category = coalesce(${niche}, public.brands.category)
    returning id`;
  await attachPages(sql, b!.id, pages.filter((p) => p.page_id !== main.page_id));
  // Ads are collected in the background; the brand page shows live progress.
  await syncBrand(b!.id);
  revalidatePath("/brands", "layout");
  revalidatePath("/tracking");
  return { ok: true, brandId: b!.id };
}

/** "Fetch all ads" for an existing brand (all its pages, full pagination). */
export async function syncBrand(brandId: string): Promise<{ ok: true; started: boolean } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return { ok: false, error: "Invalid brand" };
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  const running = syncRegistry.get(brandId);
  if (running?.state === "running") return { ok: true, started: false };
  syncRegistry.set(brandId, { state: "running", pagesDone: 0, pagesTotal: 1, ads: 0, newAds: 0, providers: [], startedAt: Date.now() });
  // The fetch runs after the response is sent: the button returns instantly and the UI polls progress.
  after(async () => {
    const update = (p: Partial<SyncProgress>) => syncRegistry.set(brandId, { ...syncRegistry.get(brandId)!, ...p });
    try {
      // Make sure every regional page of the brand is linked (cached lookup: ≤1 free credit per brand/month).
      const [brand] = await sql<{ name: string; platform_page_id: string }[]>`select name, platform_page_id from public.brands where id = ${brandId}`;
      if (brand) {
        try {
          const { pages } = await findPages(sql, brand.name);
          const extra = sameBrandPages(pages, brand.name).filter((p) => p.page_id !== brand.platform_page_id);
          if (extra.length) await attachPages(sql, brandId, extra);
        } catch {
          /* page lookup is best-effort */
        }
      }
      const r = await syncBrandAds(sql, brandId, { onProgress: update });
      if (!r.ads) update({ state: "error", error: `No ads came back (${r.tried.slice(0, 3).join(" · ")})`, finishedAt: Date.now() });
      else update({ state: "done", ads: r.ads, newAds: r.newAds, providers: r.providers, finishedAt: Date.now() });
      try {
        revalidatePath(`/brands/${brandId}`);
        revalidatePath("/discover");
      } catch {
        /* pages are dynamic anyway; the UI refreshes itself when the sync finishes */
      }
    } catch (err) {
      update({ state: "error", error: err instanceof Error ? err.message.slice(0, 200) : String(err), finishedAt: Date.now() });
    }
  });
  return { ok: true, started: true };
}

/** Progress of a background brand sync (null when none has run since the server started). */
export async function syncStatus(brandId: string): Promise<SyncProgress | null> {
  return syncRegistry.get(brandId) ?? null;
}

/** Pages of the same name, used to auto-attach regional pages when adding from search. */
export async function regionalPages(name: string): Promise<MetaPage[]> {
  const sql = getSql();
  if (isUnavailable(sql)) return [];
  const { pages } = await findPages(sql, name);
  return sameBrandPages(pages, name);
}
