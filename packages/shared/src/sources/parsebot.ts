import { HttpError, fetchJson } from "../retry.ts";
import type { AdQuery, MetaAdsProvider } from "./providers.ts";

/** One ad from Parse's "Facebook API" (marketplace, canonical v4). Dates are unix seconds. */
export interface ParseAd {
  ad_archive_id: string;
  is_active?: boolean | null;
  page_id?: string | null;
  page_name?: string | null;
  page_profile_picture_url?: string | null;
  page_profile_uri?: string | null;
  start_date?: number | string | null;
  end_date?: number | string | null;
  publisher_platforms?: string[] | null;
  body_text?: string | null;
  title?: string | null;
  caption?: string | null;
  cta_text?: string | null;
  link_url?: string | null;
  display_format?: string | null;
  images?: (string | { url?: string })[] | null;
  videos?: (string | { url?: string; video_hd_url?: string; video_preview_image_url?: string })[] | null;
  page_categories?: string[] | null;
}

const iso = (v: number | string | null | undefined) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n) && n > 1e9) return new Date(n * (n > 1e12 ? 1 : 1000)).toISOString().slice(0, 10);
  return typeof v === "string" ? v.slice(0, 10) : null;
};
const url = (m: string | { url?: string; video_hd_url?: string }) => (typeof m === "string" ? m : (m.video_hd_url ?? m.url ?? null));

/** Parse's flat ad → the raw Meta Ad Library shape our normalizer reads. */
export function fromParse(ad: ParseAd): Record<string, unknown> {
  const videos = (ad.videos ?? [])
    .map((v) => ({ video_hd_url: url(v), video_sd_url: null, video_preview_image_url: typeof v === "string" ? null : (v.video_preview_image_url ?? null) }))
    .filter((v) => v.video_hd_url);
  const images = (ad.images ?? []).map(url).filter((u): u is string => !!u).map((u) => ({ original_image_url: u, resized_image_url: u }));
  // A video ad's first image is usually its poster frame.
  if (videos.length && images[0] && !videos[0]!.video_preview_image_url) videos[0]!.video_preview_image_url = images[0].original_image_url;
  return {
    ad_archive_id: ad.ad_archive_id,
    page_id: ad.page_id ?? null,
    page_name: ad.page_name ?? null,
    is_active: ad.is_active ?? true,
    start_date: iso(ad.start_date),
    end_date: ad.is_active ? null : iso(ad.end_date),
    publisher_platform: ad.publisher_platforms ?? [],
    snapshot: {
      body: { text: ad.body_text ?? null },
      title: ad.title ?? null,
      caption: ad.caption ?? null,
      link_url: ad.link_url ?? null,
      cta_text: ad.cta_text ?? null,
      display_format: ad.display_format ?? (videos.length ? "VIDEO" : "IMAGE"),
      page_name: ad.page_name ?? null,
      page_profile_uri: ad.page_profile_uri ?? null,
      page_profile_picture_url: ad.page_profile_picture_url ?? null,
      page_categories: ad.page_categories ?? [],
      images: videos.length ? [] : images,
      videos,
      cards: [],
    },
  };
}

const API = "https://api.parse.bot/scraper/d992d152-9f1b-493e-80a4-5aec30d9b03c";

/** Parse (parse.bot) Facebook Ad Library API: ~30 ads per call, 3 credits per call, cursor pagination. 200 free credits. */
export const parseBotProvider: MetaAdsProvider = {
  id: "parsebot",
  label: "Parse",
  envKey: "PARSE_API_KEY",
  free: { units: 195, period: "lifetime" },
  pageCost: 3,
  async fetchAds(apiKey: string, q: AdQuery) {
    const items: unknown[] = [];
    let units = 0;
    let cursor = "";
    const maxCalls = Math.min(5, Math.ceil(q.limit / 30));
    for (let call = 0; call < maxCalls; call++) {
      const p = new URLSearchParams({ country: q.country ?? "ALL", active_status: "active", ...(q.pageId ? { page_id: q.pageId } : { query: q.q ?? "", ad_type: "all", search_type: "keyword_unordered", media_type: "all" }) });
      if (cursor) p.set("forward_cursor", cursor);
      const res = await fetchJson<{ status?: string; data?: { ads?: ParseAd[]; page_info?: { end_cursor?: string; has_next_page?: boolean } } }>(
        `${API}/${q.pageId ? "search_page_ads" : "search_ads"}?${p}`,
        { headers: { "X-API-Key": apiKey }, timeoutMs: 90_000 },
      );
      units += 3;
      if (res.status && res.status !== "success") throw new HttpError(502, `parse: ${res.status}`);
      items.push(...(res.data?.ads ?? []).filter((a) => a.ad_archive_id).map(fromParse));
      cursor = res.data?.page_info?.has_next_page ? (res.data.page_info.end_cursor ?? "") : "";
      if (!cursor || items.length >= q.limit) break;
    }
    return { items: items.slice(0, q.limit), units };
  },
};
