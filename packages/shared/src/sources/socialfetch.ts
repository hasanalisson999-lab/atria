import { HttpError, fetchJson } from "../retry.ts";
import type { AdQuery, MetaAdsProvider } from "./providers.ts";

/** One ad as Social Fetch returns it (camelCase, grouped into page / creative). */
interface SfMedia {
  [k: string]: unknown;
}
export interface SocialFetchAd {
  id: string;
  page?: { id?: string; name?: string; url?: string; profilePictureUrl?: string; likeCount?: number; categories?: string[] } | null;
  campaign?: { collationId?: string | null; collationCount?: number | null } | null;
  isActive?: boolean | null;
  publisherPlatforms?: string[] | null;
  startedAt?: string | null;
  endedAt?: string | null;
  countries?: string[] | null;
  creative?: {
    bodyText?: string | null;
    title?: string | null;
    caption?: string | null;
    linkUrl?: string | null;
    linkDescription?: string | null;
    callToAction?: string | null;
    callToActionType?: string | null;
    displayFormat?: string | null;
    images?: (SfMedia | string)[] | null;
    videos?: (SfMedia | string)[] | null;
    cards?: { title?: string | null; body?: string | null; caption?: string | null; linkUrl?: string | null; imageUrl?: string | null; videoUrl?: string | null; videoPreviewUrl?: string | null }[] | null;
  } | null;
}

const str = (m: SfMedia | string, keys: string[]): string | null => {
  if (typeof m === "string") return m;
  for (const k of keys) if (typeof m[k] === "string" && m[k]) return m[k] as string;
  return null;
};

/** Social Fetch's ad → the raw Meta Ad Library shape our normalizer reads. */
export function fromSocialFetch(ad: SocialFetchAd): Record<string, unknown> {
  const c = ad.creative ?? {};
  const images = (c.images ?? [])
    .map((m) => str(m, ["originalImageUrl", "originalUrl", "url", "resizedImageUrl", "resizedUrl"]))
    .filter((u): u is string => !!u)
    .map((u) => ({ original_image_url: u, resized_image_url: u }));
  const videos = (c.videos ?? [])
    .map((m) => ({
      video_hd_url: str(m, ["hdUrl", "videoHdUrl", "url"]),
      video_sd_url: str(m, ["sdUrl", "videoSdUrl"]),
      video_preview_image_url: typeof m === "string" ? null : str(m, ["previewImageUrl", "videoPreviewImageUrl", "previewUrl", "thumbnailUrl"]),
    }))
    .filter((v) => v.video_hd_url || v.video_sd_url);
  const cards = (c.cards ?? []).map((k) => ({
    title: k.title ?? null,
    body: k.body ?? null,
    caption: k.caption ?? null,
    link_url: k.linkUrl ?? null,
    original_image_url: k.imageUrl ?? null,
    resized_image_url: k.imageUrl ?? null,
    video_hd_url: k.videoUrl ?? null,
    video_preview_image_url: k.videoPreviewUrl ?? null,
  }));
  return {
    ad_archive_id: ad.id,
    page_id: ad.page?.id ?? null,
    page_name: ad.page?.name ?? null,
    is_active: ad.isActive ?? true,
    start_date: ad.startedAt ?? null,
    end_date: ad.endedAt ?? null,
    collation_id: ad.campaign?.collationId ?? null,
    collation_count: ad.campaign?.collationCount ?? null,
    publisher_platform: ad.publisherPlatforms ?? [],
    targeted_or_reached_countries: ad.countries ?? [],
    snapshot: {
      body: { text: c.bodyText ?? null },
      title: c.title ?? null,
      caption: c.caption ?? null,
      link_url: c.linkUrl ?? null,
      link_description: c.linkDescription ?? null,
      cta_text: c.callToAction ?? null,
      cta_type: c.callToActionType ?? null,
      display_format: c.displayFormat ?? null,
      page_name: ad.page?.name ?? null,
      page_profile_uri: ad.page?.url ?? null,
      page_profile_picture_url: ad.page?.profilePictureUrl ?? null,
      page_like_count: ad.page?.likeCount ?? null,
      page_categories: ad.page?.categories ?? [],
      images,
      videos,
      cards,
    },
  };
}

const MAX_PAGES = (limit: number) => Math.min(15, Math.ceil(limit / 30) + 1);

/** Social Fetch: Meta Ad Library by page (~30 ads per credit, cursor pagination). 100 free credits. */
export const socialFetchProvider: MetaAdsProvider = {
  id: "socialfetch",
  label: "Social Fetch",
  envKey: "SOCIALFETCH_API_KEY",
  free: { units: 100, period: "lifetime" },
  async fetchAds(apiKey: string, q: AdQuery) {
    const items: unknown[] = [];
    let units = 0;
    let cursor: string | null = null;
    const base = q.pageId ? "https://api.socialfetch.dev/v1/facebook/ad-library/companies/ads" : "https://api.socialfetch.dev/v1/facebook/ad-library/ads/search";
    do {
      const p = new URLSearchParams(q.pageId ? { pageId: q.pageId } : { query: q.q ?? "" });
      if (cursor) p.set("cursor", cursor);
      const res = await fetchJson<{ data?: { lookupStatus?: string; ads?: SocialFetchAd[]; page?: { nextCursor?: string | null; hasMore?: boolean } }; meta?: { creditsCharged?: number } }>(
        `${base}?${p}`,
        { headers: { "x-api-key": apiKey }, timeoutMs: 90_000 },
      );
      units += res.meta?.creditsCharged ?? 1;
      if (res.data?.lookupStatus === "not_found") break;
      items.push(...(res.data?.ads ?? []).map(fromSocialFetch));
      cursor = res.data?.page?.hasMore ? (res.data.page.nextCursor ?? null) : null;
    } while (cursor && items.length < q.limit && units < MAX_PAGES(q.limit));
    if (!items.length && units === 0) throw new HttpError(502, "socialfetch: empty response");
    return { items: items.slice(0, q.limit), units };
  },
};
