import { HttpError, fetchJson } from "../retry.ts";
import type { AdQuery, MetaAdsProvider } from "./providers.ts";

/** One creative from Adspo (api.adspo.co). Media lives on Adspo's own CDN, so URLs don't expire. */
export interface AdspoCreative {
  creative_id: string;
  brand_id?: string | null;
  brand_name?: string | null;
  format?: string | null;
  hd_url?: string | null;
  sd_url?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  ad_count?: number | null;
  landing_pages?: string[] | null;
  countries?: string[] | null;
  hook?: string | null;
}

/**
 * Adspo returns creatives, not Meta ad archive ids. A stable numeric id is derived from the creative id
 * (prefixed "7" + 17 digits so it can't collide with real ~15–16 digit archive ids).
 */
export function adspoId(creativeId: string): string {
  const n = BigInt(`0x${creativeId.replace(/[^0-9a-f]/gi, "").slice(0, 14) || "0"}`) % 10n ** 17n;
  return `7${n.toString().padStart(17, "0")}`;
}

/** Adspo creative → the raw Meta Ad Library shape our normalizer reads. */
export function fromAdspo(c: AdspoCreative): Record<string, unknown> {
  const video = (c.format ?? "").toUpperCase() === "VIDEO";
  return {
    ad_archive_id: adspoId(c.creative_id),
    page_id: c.brand_id ?? null,
    page_name: c.brand_name ?? null,
    is_active: c.is_active ?? true,
    start_date: c.start_date?.slice(0, 10) ?? null,
    end_date: c.end_date?.slice(0, 10) ?? null,
    collation_count: c.ad_count ?? null,
    publisher_platform: ["FACEBOOK", "INSTAGRAM"],
    targeted_or_reached_countries: (c.countries ?? []).filter((x) => /^[A-Z]{2}$/.test(x)),
    snapshot: {
      body: { text: c.hook ?? null },
      link_url: c.landing_pages?.[0] ?? null,
      display_format: video ? "VIDEO" : "IMAGE",
      page_name: c.brand_name ?? null,
      images: !video && c.hd_url ? [{ original_image_url: c.hd_url, resized_image_url: c.sd_url ?? c.hd_url }] : [],
      videos: video && (c.hd_url || c.sd_url) ? [{ video_hd_url: c.hd_url ?? null, video_sd_url: c.sd_url ?? null, video_preview_image_url: null }] : [],
      cards: [],
    },
  };
}

const API = "https://api.adspo.co/v1";

/**
 * Adspo: a brand's creatives by Facebook page id (~12 per call, cursor pagination). 10,000 free credits a
 * year, so it's the high-volume fallback. Page queries only; it has no ad copy, so it sits after the
 * sources that do.
 */
export const adspoProvider: MetaAdsProvider = {
  id: "adspo",
  label: "Adspo",
  envKey: "ADSPO_API_KEY",
  free: { units: 9500, period: "lifetime" },
  async fetchAds(apiKey: string, q: AdQuery) {
    if (!q.pageId) throw new HttpError(400, "adspo: page queries only");
    const items: unknown[] = [];
    let units = 0;
    let cursor = "";
    for (let call = 0; call < Math.min(8, Math.ceil(q.limit / 12)); call++) {
      const p = new URLSearchParams({ limit: "30" });
      if (cursor) p.set("cursor", cursor);
      const res = await fetchJson<{ error?: string; next_cursor?: string | null; creatives?: AdspoCreative[] }>(`${API}/brands/${encodeURIComponent(q.pageId)}/creatives?${p}`, {
        headers: { "x-api-key": apiKey },
        timeoutMs: 45_000,
      });
      units += 1;
      // Adspo doesn't know this page: let the next provider answer.
      if (res.error) throw new HttpError(404, `adspo: ${res.error}`);
      items.push(...(res.creatives ?? []).filter((c) => c.creative_id && c.hd_url).map(fromAdspo));
      // Adspo doesn't track this page yet: let the next source answer instead of reporting "no ads".
      if (call === 0 && !items.length) throw new HttpError(404, "adspo: page not tracked");
      cursor = res.next_cursor ?? "";
      if (!cursor || items.length >= q.limit) break;
    }
    return { items: items.slice(0, q.limit), units };
  },
};
