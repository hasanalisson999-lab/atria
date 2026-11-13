import type { NormalizedAd, NormalizedMedia } from "../../types.ts";
import {
  arr,
  num,
  cleanUrl,
  domainOf,
  isObj,
  isTemplateText,
  normalizeFormat,
  normalizePlatforms,
  pick,
  str,
  textHash,
  toIsoDate,
} from "./util.ts";

/**
 * Normalizes Meta Ad Library items as returned by Apify scrapers. Handles:
 *   - the raw Ad Library shape in snake_case (curious_coder, automly "legacy")
 *   - the same shape in camelCase (apify/facebook-ads-scraper)
 *   - automly's "clean" flat shape
 */
export interface NormalizeContext {
  source: string;
  /** Country the query ran for; used when the item has no country data. */
  country?: string;
}

export function normalizeAdLibraryItem(raw: unknown, ctx: NormalizeContext): NormalizedAd | null {
  if (!isObj(raw)) return null;
  const id = str(pick(raw, "ad_archive_id", "adArchiveID", "adArchiveId", "id"));
  if (!id || !/^\d+$/.test(id)) return null;
  // automly "clean" output is flat: no snapshot, has bodyText/imageUrls.
  return isObj(raw.snapshot) ? fromRawShape(id, raw, ctx) : fromFlatShape(id, raw, ctx);
}

function mediaFromCard(c: unknown): NormalizedMedia[] {
  const out: NormalizedMedia[] = [];
  const video = cleanUrl(pick(c, "video_hd_url", "videoHdUrl", "video_sd_url", "videoSdUrl", "video_hd", "video_sd"));
  const preview = cleanUrl(pick(c, "video_preview_image_url", "videoPreviewImageUrl", "video_preview_image"));
  if (video) out.push({ type: "video", url: video, previewUrl: preview });
  const image = cleanUrl(pick(c, "original_image_url", "originalImageUrl", "resized_image_url", "resizedImageUrl", "imageUrl", "original_image", "resized_image"));
  if (image && !video) out.push({ type: "image", url: image });
  return out;
}

function dedupeMedia(media: NormalizedMedia[]): NormalizedMedia[] {
  const seen = new Set<string>();
  return media.filter((m) => {
    // Signed CDN URLs differ only by query string between duplicates.
    const key = `${m.type}:${m.url.split("?")[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countriesOf(raw: Record<string, unknown>, ctx: NormalizeContext): string[] {
  const list = arr(pick(raw, "targeted_or_reached_countries", "targetedOrReachedCountries", "countries"))
    .map((c) => String(c).toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  if (list.length) return [...new Set(list)].sort();
  return ctx.country && ctx.country !== "ALL" ? [ctx.country.toUpperCase()] : [];
}

function finish(partial: Omit<NormalizedAd, "creativeHash" | "landingDomain"> & { captionDomain?: unknown }): NormalizedAd {
  const { captionDomain, ...ad } = partial;
  const landingDomain = domainOf(ad.landingUrl, captionDomain);
  const creativeHash = ad.collationId
    ? `col:${ad.collationId}`
    : `txt:${textHash([ad.brand?.platformPageId, ad.bodyText, ad.headline, ad.cta, landingDomain])}`;
  return { ...ad, landingDomain, creativeHash };
}

function fromRawShape(id: string, raw: Record<string, unknown>, ctx: NormalizeContext): NormalizedAd {
  const snap = raw.snapshot as Record<string, unknown>;
  const cards = arr(pick(snap, "cards"));
  const firstCard = cards[0];

  let body = str(pick(snap, "body"));
  let headline = str(pick(snap, "title"));
  let description = str(pick(snap, "link_description", "linkDescription"));
  // DCO/DPA ads: the top-level copy is a template; real copy lives in the cards.
  if (isTemplateText(body)) body = str(pick(firstCard, "body"));
  if (isTemplateText(headline)) headline = str(pick(firstCard, "title"));
  if (isTemplateText(description)) description = str(pick(firstCard, "link_description", "linkDescription"));
  body ??= str(pick(firstCard, "body"));
  headline ??= str(pick(firstCard, "title"));

  const images = arr(pick(snap, "images"))
    .map((i) => cleanUrl(pick(i, "original_image_url", "originalImageUrl", "resized_image_url", "resizedImageUrl")))
    .filter((u): u is string => !!u)
    .map((url): NormalizedMedia => ({ type: "image", url }));
  const videos = arr(pick(snap, "videos")).flatMap((v) => mediaFromCard(v).filter((m) => m.type === "video"));
  const cardMedia = cards.flatMap(mediaFromCard);
  const media = dedupeMedia([...videos, ...images, ...cardMedia]);

  const landingUrl = cleanUrl(pick(snap, "link_url", "linkUrl")) ?? cleanUrl(pick(firstCard, "link_url", "linkUrl"));
  const pageId = str(pick(raw, "page_id", "pageID", "pageId") ?? pick(snap, "page_id", "pageId"));
  const pageName = str(pick(raw, "page_name", "pageName") ?? pick(snap, "page_name", "pageName"));
  const endDate = toIsoDate(pick(raw, "end_date", "endDateFormatted", "endDate"));
  const isActiveRaw = pick(raw, "is_active", "isActive");
  const collationId = str(pick(raw, "collation_id", "collationId"));
  const collationCount = Number(pick(raw, "collation_count", "collationCount") ?? 1);

  return finish({
    source: ctx.source,
    sourceAdId: id,
    brand: pageId
      ? {
          platform: "meta",
          platformPageId: pageId,
          name: pageName ?? pageId,
          logoUrl: cleanUrl(pick(snap, "page_profile_picture_url", "pageProfilePictureUrl")),
          pageUrl: cleanUrl(pick(snap, "page_profile_uri", "pageProfileUri")),
          category: str(arr(pick(snap, "page_categories", "pageCategories"))[0]),
          likes: num(pick(snap, "page_like_count", "pageLikeCount")),
        }
      : null,
    platforms: normalizePlatforms(pick(raw, "publisher_platform", "publisherPlatform", "publisherPlatforms")),
    format: normalizeFormat(pick(snap, "display_format", "displayFormat"), {
      videos: media.filter((m) => m.type === "video").length,
      images: media.filter((m) => m.type === "image").length,
      cards: cards.length,
    }),
    bodyText: body,
    headline,
    description,
    cta: str(pick(snap, "cta_text", "ctaText")) ?? str(pick(firstCard, "cta_text", "ctaText")),
    landingUrl,
    captionDomain: pick(snap, "caption"),
    countries: countriesOf(raw, ctx),
    startDate: toIsoDate(pick(raw, "start_date", "startDateFormatted", "startDate")),
    endDate,
    isActive: typeof isActiveRaw === "boolean" ? isActiveRaw : endDate === null,
    collationId,
    variationsCount: Number.isFinite(collationCount) && collationCount > 0 ? Math.floor(collationCount) : 1,
    media,
    raw,
  });
}

/** Flat shapes: automly "clean" output and SerpApi's meta_ad_library results. */
function fromFlatShape(id: string, raw: Record<string, unknown>, ctx: NormalizeContext): NormalizedAd {
  const cards = arr(raw.cards);
  const imageMedia = [...arr(raw.imageUrls), ...arr(raw.images)]
    .flatMap((v) => (typeof v === "string" ? [cleanUrl(v)] : mediaFromCard(v).map((m) => m.url)))
    .filter((u): u is string => !!u)
    .map((url): NormalizedMedia => ({ type: "image", url }));
  const topVideo = mediaFromCard(raw).filter((m) => m.type === "video");
  const videoMedia = [...topVideo, ...arr(raw.videos).flatMap((v) => (typeof v === "string" ? [{ type: "video" as const, url: v }] : mediaFromCard(v)))];
  const media = dedupeMedia([
    ...videoMedia.filter((m) => cleanUrl(m.url)).map((m) => ({ ...m, url: cleanUrl(m.url)! })),
    ...imageMedia,
    ...cards.flatMap(mediaFromCard),
  ]);
  const endDate = toIsoDate(pick(raw, "endDate", "end_date"));
  const pageId = str(pick(raw, "pageId", "page_id"));
  const versions = Number(pick(raw, "versionCount", "collation_count", "collationCount") ?? 1);
  const firstCard = cards[0];

  return finish({
    source: ctx.source,
    sourceAdId: id,
    brand: pageId
      ? {
          platform: "meta",
          platformPageId: pageId,
          name: str(pick(raw, "pageName", "page_name")) ?? pageId,
          logoUrl: cleanUrl(pick(raw, "pageProfilePictureUrl", "page_profile_picture")),
          pageUrl: cleanUrl(pick(raw, "pageUrl", "page_profile_link")),
          category: str(raw.pageCategory) ?? str(arr(raw.page_categories)[0]),
          likes: num(pick(raw, "pageLikes", "page_likes")),
        }
      : null,
    platforms: normalizePlatforms(pick(raw, "platforms", "publisher_platforms")),
    format: normalizeFormat(pick(raw, "adFormat", "display_format"), {
      videos: media.filter((m) => m.type === "video").length,
      images: media.filter((m) => m.type === "image").length,
      cards: cards.length,
    }),
    bodyText: str(pick(raw, "bodyText", "body")) ?? str(pick(firstCard, "body", "bodyText")),
    headline: str(pick(raw, "headline", "title")) ?? str(pick(firstCard, "title", "headline")),
    description: str(pick(raw, "linkDescription", "link_description")) ?? str(pick(firstCard, "link_description")),
    cta: str(pick(raw, "ctaText", "call_to_action")),
    landingUrl: cleanUrl(pick(raw, "linkUrl", "link")) ?? cleanUrl(pick(firstCard, "link", "linkUrl")),
    captionDomain: pick(raw, "linkDomain", "linkCaption", "caption"),
    countries: countriesOf(raw, ctx),
    startDate: toIsoDate(pick(raw, "startDate", "start_date")),
    endDate,
    isActive: typeof pick(raw, "isActive", "is_active") === "boolean" ? (pick(raw, "isActive", "is_active") as boolean) : endDate === null,
    collationId: str(pick(raw, "collationId", "collation_id")),
    variationsCount: Number.isFinite(versions) && versions > 0 ? Math.floor(versions) : 1,
    media,
    raw,
  });
}
