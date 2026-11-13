import "server-only";
import { CATEGORIES, type CatalogBrand, categoryById, fetchWithFallback, normName } from "@signal/shared";
import { embedMissingAds } from "@signal/shared/ai";
import { fromPostgresJs, upsertAds, type Sql } from "@signal/shared/db";
import { dedupeCreatives } from "@signal/shared/media";
import { findPages, type MetaPage } from "./brand-sync";

export interface SeedProgress {
  state: "running" | "done" | "error";
  total: number;
  done: number;
  added: string[];
  skipped: string[];
  ads: number;
  error?: string;
  finishedAt?: number;
}

const g = globalThis as unknown as { __atriaSeeds?: Map<string, SeedProgress> };
export const seedRegistry: Map<string, SeedProgress> = (g.__atriaSeeds ??= new Map());

/** Facebook page categories that are never a product brand (schools, TV, media, artists…). */
const NOT_A_BRAND = /(education|school|college|university|tv |television|tv show|tv channel|artist|musician|band|media|news|magazine|entertainment|advertising|marketing agency|agency|public figure|politician|government|community|personal blog|video creator|gamer|athlete|church|religious|movie|film)/i;
const FOOD = /(food|beverage|restaurant|brewery|bar|cafe|winery)/i;
/** Page categories that fit each catalog category (used when ads link to retailers, not the brand's site). */
const FITS: Record<string, RegExp> = {
  footwear: /(shoe|footwear|sport|outdoor|clothing|apparel|fashion|brand|product|retail|shopping)/i,
  apparel: /(clothing|apparel|fashion|sport|brand|product|retail|shopping)/i,
  supplements: /(vitamin|supplement|health|nutrition|wellness|brand|product)/i,
  skincare: /(beauty|health|cosmetic|skin|brand|product)/i,
  makeup: /(beauty|cosmetic|makeup|brand|product)/i,
  haircare: /(beauty|hair|cosmetic|brand|product)/i,
  fragrance: /(beauty|fragrance|perfume|cosmetic|brand|product)/i,
};

/** Is this page really the brand? Wrong category kills it; otherwise its ads must link to the brand or the page category must fit. */
export function looksLikeBrand(page: MetaPage, brand: string, categoryId: string, domains: string[]): boolean {
  const cat = page.category ?? "";
  if (NOT_A_BRAND.test(cat)) return false;
  if (categoryId !== "food" && FOOD.test(cat)) return false;
  const joined = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  const words = brand.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  // Exact brand label only: "teva.com", "us.karhu.com", "nordarun.com" — never "nordace.com" for Norda.
  const SUFFIX = /^(run|running|shoes|footwear|sport|sports|usa|us|eu|uk|official|store|shop|global|world|brand|co|hq)?$/;
  const domainHit = domains.some((d) =>
    d
      .toLowerCase()
      .replace(/^www./, "")
      .split(/[.-]/)
      .some((label) => label === joined || (label.startsWith(joined) && SUFFIX.test(label.slice(joined.length))) || words.some((w) => label === w)),
  );
  return domainHit || (FITS[categoryId]?.test(cat) ?? true);
}

/** Candidate official pages, best first: exact/close name match, verified, then most followers. */
export function rankPages(pages: MetaPage[], name: string): MetaPage[] {
  const n = normName(name);
  return pages
    .map((p) => {
      const pn = normName(p.name);
      const nameScore = pn === n ? 3 : pn.startsWith(n) || n.startsWith(pn) ? 2 : pn.includes(n) ? 1 : 0;
      return { p, score: nameScore * 10 + (p.verified ? 5 : 0) + Math.log10(Math.max(1, p.likes ?? 0)) };
    })
    .filter((x) => x.score >= 10 && (x.p.likes ?? 0) >= 10_000)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

/** The official page for a brand name: exact/close name match, verified first, then most followers. */
export function pickOfficialPage(pages: MetaPage[], name: string): MetaPage | null {
  const n = normName(name);
  const scored = pages
    .map((p) => {
      const pn = normName(p.name);
      const nameScore = pn === n ? 3 : pn.startsWith(n) || n.startsWith(pn) ? 2 : pn.includes(n) ? 1 : 0;
      return { p, score: nameScore * 10 + (p.verified ? 5 : 0) + Math.log10(Math.max(1, p.likes ?? 0)) };
    })
    .filter((x) => x.score >= 10 && (x.p.likes ?? 0) >= 10_000)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

/** Brands of a category that aren't in the library yet. */
export async function missingBrands(sql: Sql, categoryId: string): Promise<CatalogBrand[]> {
  const cat = categoryById(categoryId);
  if (!cat) return [];
  const have = await sql<{ n: string }[]>`select lower(name) as n from public.brands
    union all select substr(key, 10) from public.search_cache where key like 'seedskip:%' and created_at > now() - interval '30 days'`;
  const set = new Set(have.map((h) => normName(h.n)));
  return cat.brands.filter((b) => !set.has(normName(b.name)));
}

/** Specific brands (e.g. your competitors from onboarding) that aren't in the library yet. */
export async function missingNamed(sql: Sql, names: string[]): Promise<CatalogBrand[]> {
  const have = await sql<{ n: string }[]>`select lower(name) as n from public.brands where merged_into is null`;
  const set = new Set(have.map((h) => normName(h.n)));
  const all = CATEGORIES.flatMap((c) => c.brands);
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    .filter((n) => !set.has(normName(n)))
    .map((n) => all.find((b) => normName(b.name) === normName(n)) ?? { name: n, tier: "challenger" as const });
}

/**
 * Adds up to `max` brands of a category: official page → brand row (curated, in the category) → its most
 * recent public ads. Free sources only; each brand costs about one page lookup and one ad search.
 */
export async function seedCategoryBrands(sql: Sql, categoryId: string, max: number, onProgress: (p: Partial<SeedProgress>) => void, opts: { names?: string[] } = {}): Promise<void> {
  const db = fromPostgresJs(sql);
  const todo = (opts.names ? await missingNamed(sql, opts.names) : await missingBrands(sql, categoryId)).slice(0, max);
  onProgress({ total: todo.length });
  const added: string[] = [];
  const skipped: string[] = [];
  let ads = 0;
  let done = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      try {
        // Search with the brand's better query when it has one, and merge in plain-name results.
        const first = await findPages(sql, b.query ?? b.name);
        const pages = b.query ? [...first.pages, ...(await findPages(sql, b.name)).pages.filter((x) => !first.pages.some((y) => y.page_id === x.page_id))] : first.pages;
        // Try the best few candidate pages; keep the first whose category and ads prove it's the brand.
        let page: MetaPage | null = null;
        let chain: Awaited<ReturnType<typeof fetchWithFallback>> | null = null;
        // Only a real "wrong page / no ads" answer counts against a brand; running out of free credits doesn't.
        let answered = false;
        for (const cand of rankPages(pages, b.name).filter((c) => !NOT_A_BRAND.test(c.category ?? "")).slice(0, 3)) {
          const res = await fetchWithFallback(db, { pageId: cand.page_id, limit: 30 }, { jobId: `seed:${categoryId}` });
          if (res.provider) answered = true;
          const domains = res.ads.map((a) => a.landingDomain).filter((d): d is string => !!d);
          if (res.ads.length && looksLikeBrand(cand, b.name, categoryId, domains)) {
            page = cand;
            chain = res;
            break;
          }
        }
        if (!page || !chain) {
          skipped.push(b.name);
          // Remember for 30 days only when a source actually answered (pages found but none proved to be the brand).
          if (pages.length && answered)
            await sql`insert into public.search_cache (key, provider, result) values (${`seedskip:${b.name.toLowerCase()}`}, 'seed', '{}'::jsonb)
                      on conflict (key) do update set created_at = now()`;
        } else {
          const [row] = await sql<{ id: string }[]>`
            insert into public.brands (platform, platform_page_id, name, logo_url, page_likes, page_category, quality, is_curated, status, category, tier, aliases)
            values ('meta', ${page.page_id}, ${b.name}, ${page.image}, ${page.likes}, ${page.category}, 'brand', true, 'discovered', ${categoryId}, ${b.tier ?? "challenger"}, ${[b.name]})
            on conflict (platform, platform_page_id) do update set name = excluded.name, quality = 'brand', is_curated = true,
              category = coalesce(public.brands.category, excluded.category), tier = coalesce(public.brands.tier, excluded.tier), merged_into = null
            returning id`;
          if (chain.ads.length) {
            const r = await upsertAds(db, chain.ads);
            ads += r.inserted;
            // Ads land on the page's brand row; make sure it's the curated one.
            await sql`update public.ads set brand_id = ${row!.id} where brand_id in (select id from public.brands where platform_page_id = ${page.page_id})`;
            await sql`update public.brands set ads_synced_at = now() where id = ${row!.id}`;
            await dedupeCreatives(db, { concurrency: 6, brandId: row!.id }).catch(() => undefined);
          }
          added.push(b.name);
        }
      } catch {
        skipped.push(b.name);
      }
      done++;
      onProgress({ done, added: [...added], skipped: [...skipped], ads });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, todo.length || 1) }, worker));
  if (process.env.VOYAGE_API_KEY) await embedMissingAds(process.env.VOYAGE_API_KEY, db, { limit: 600 }).catch(() => undefined);
}
