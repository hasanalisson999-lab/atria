import type { Queryable } from "../db/client.ts";
import { normName } from "../discovery/brands-seed.ts";
import { HttpError, fetchJson } from "../retry.ts";
import type { NormalizedAd } from "../types.ts";

/**
 * TikTok ads from the public TikTok Ad Library (EU Commercial Content Library), via free-credit APIs:
 * ScrapeCreators first, SocialCrawl as the fallback. Keyword search also returns creators who merely
 * mention a brand, so only ads whose advertiser name matches the brand are kept.
 */

export const TIKTOK_SOURCE = "tiktok_ad_library";

interface TikTokItem {
  id: string;
  name?: string | null;
  title?: string | null;
  first_shown_date?: number | null;
  last_shown_date?: number | null;
  videos?: { video_url?: string | null; cover_img?: string | null }[] | null;
  image_urls?: string[] | null;
  subject?: string | null;
  url?: string | null;
}

const day = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

export function normalizeTikTokAd(it: TikTokItem): NormalizedAd | null {
  if (!it?.id) return null;
  const video = it.videos?.find((v) => v?.video_url) ?? null;
  const images = (it.image_urls ?? []).filter(Boolean);
  const last = it.last_shown_date ?? null;
  return {
    source: TIKTOK_SOURCE,
    sourceAdId: String(it.id),
    brand: null,
    platforms: ["tiktok"],
    format: video ? "video" : images.length > 1 ? "carousel" : images.length ? "image" : "unknown",
    bodyText: it.title?.trim() || null,
    headline: null,
    description: null,
    cta: null,
    landingUrl: null,
    landingDomain: null,
    countries: [],
    startDate: day(it.first_shown_date),
    endDate: day(last),
    // Shown within the last week = still running.
    isActive: last ? Date.now() - last < 8 * 864e5 : true,
    collationId: null,
    variationsCount: 1,
    creativeHash: `tiktok:${it.id}`,
    media: video ? [{ type: "video", url: video.video_url!, previewUrl: video.cover_img ?? null }] : images.map((url) => ({ type: "image" as const, url })),
    raw: it,
  };
}

/** Does this TikTok advertiser name belong to the brand? */
export function tiktokAdvertiserMatches(advertiser: string | null | undefined, brand: string): boolean {
  // Accents off ("S.À R.L." → "sarl"), then letters and digits only.
  const flat = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = flat(normName(advertiser ?? ""));
  const b = flat(normName(brand));
  if (a.length < 2 || b.length < 2) return false;
  if (a === b) return true;
  // Official regional / store / legal-entity accounts only ("HOKA EU", "SKECHERS S.À R.L."), never fans like "crocsfan99".
  const SUFFIX =
    "(official|officiel|global|europe|international|eu|us|usa|uk|de|fr|it|es|nl|nordics|store|shop|running|footwear|shoes|brand|group|holdings?|inc|ltd|llc|gmbh|sarl|sas|sa|srl|spa|bv|nv|ag|ab|oy|aps|plc|corp|co)";
  return new RegExp(`^(the)?${b.replace(/[^a-z0-9]/g, "")}${SUFFIX}{1,3}$`).test(a);
}

async function used(db: Queryable, provider: string): Promise<number> {
  const [r] = await db.query<{ n: string | number }>("select coalesce(sum(units), 0) as n from public.cost_ledger where provider = $1", [provider]);
  return Number(r?.n ?? 0);
}

async function log(db: Queryable, provider: string, units: number, meta: Record<string, unknown>) {
  await db.query("insert into public.cost_ledger (provider, operation, units, usd, meta) values ($1, 'tiktok-ads', $2, 0, $3::text::jsonb)", [provider, units, JSON.stringify({ free_tier: true, ...meta })]);
}

export interface TikTokResult {
  ads: NormalizedAd[];
  provider: string | null;
  tried: string[];
}

/** A brand's TikTok ads (up to `limit`), from the first free source that answers. */
export async function fetchTikTokAds(db: Queryable, brand: string, opts: { limit?: number; env?: Record<string, string | undefined> } = {}): Promise<TikTokResult> {
  const env = opts.env ?? process.env;
  const limit = opts.limit ?? 36;
  const tried: string[] = [];

  // 1) ScrapeCreators: keyword search, 12 per page, filter to the brand's own advertiser account.
  const sc = env.SCRAPECREATORS_API_KEY;
  if (sc && (await used(db, "scrapecreators")) < 96) {
    try {
      const out: NormalizedAd[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const p = new URLSearchParams({ query: brand });
        if (cursor) p.set("cursor", cursor);
        const res = await fetchJson<{ ads?: TikTokItem[]; cursor?: string; has_more?: boolean; credits_charged?: number }>(`https://api.scrapecreators.com/v1/tiktok/ad-library/search?${p}`, {
          headers: { "x-api-key": sc },
          timeoutMs: 60_000,
        });
        pages++;
        await log(db, "scrapecreators", res.credits_charged ?? 1, { brand, page: pages });
        for (const it of res.ads ?? []) if (tiktokAdvertiserMatches(it.name, brand)) out.push(normalizeTikTokAd(it)!);
        cursor = res.has_more && res.cursor ? res.cursor : undefined;
      } while (cursor && out.length < limit && pages < 3);
      tried.push(`scrapecreators: ${out.length} ads`);
      if (out.length) return { ads: out.slice(0, limit), provider: "scrapecreators", tried };
    } catch (e) {
      tried.push(`scrapecreators: ${e instanceof HttpError ? `HTTP ${e.status}` : "error"}`);
    }
  } else tried.push("scrapecreators: not available");

  // 2) SocialCrawl: searches by advertiser name directly (5 credits per page of 12).
  const scr = env.SOCIALCRAWL_API_KEY;
  if (scr && (await used(db, "socialcrawl")) < 90) {
    try {
      const res = await fetchJson<{ data?: { items?: { post?: Record<string, unknown> }[] }; credits_used?: number }>(
        `https://www.socialcrawl.dev/v1/tiktok/adlibrary/search?${new URLSearchParams({ advertiser_name: brand })}`,
        { headers: { "x-api-key": scr }, timeoutMs: 60_000 },
      );
      await log(db, "socialcrawl", res.credits_used ?? 5, { brand });
      const ads = (res.data?.items ?? [])
        .map((x) => x.post ?? {})
        .filter((p) => tiktokAdvertiserMatches(((p.author as Record<string, unknown> | undefined)?.display_name as string) ?? null, brand))
        .map((p) => {
          const content = (p.content ?? {}) as { text?: string; media_urls?: string[]; thumbnail_url?: string };
          return normalizeTikTokAd({
            id: String(p.id),
            name: ((p.author as Record<string, unknown> | undefined)?.display_name as string) ?? null,
            title: content.text ?? null,
            first_shown_date: p.published_at ? Date.parse(String(p.published_at)) : null,
            videos: content.media_urls?.[0] ? [{ video_url: content.media_urls[0], cover_img: content.thumbnail_url ?? null }] : [],
          });
        })
        .filter((a): a is NormalizedAd => !!a);
      tried.push(`socialcrawl: ${ads.length} ads`);
      if (ads.length) return { ads: ads.slice(0, limit), provider: "socialcrawl", tried };
    } catch (e) {
      tried.push(`socialcrawl: ${e instanceof HttpError ? `HTTP ${e.status}` : "error"}`);
    }
  } else tried.push("socialcrawl: not available");

  return { ads: [], provider: null, tried };
}
