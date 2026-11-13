import { HttpError, fetchJson } from "../retry.ts";
import type { AdQuery, MetaAdsProvider } from "./providers.ts";

/** One record of Bright Data's "Meta - Ad Library" dataset. */
export interface BrightDataAd {
  library_id?: string | null;
  url?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  versions_count?: number | null;
  platforms?: string[] | null;
  description?: string | null;
  title?: string | null;
  link_description?: string | null;
  caption?: string | null;
  cta_text?: string | null;
  cta_type?: string | null;
  link_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  video_preview_image?: string | null;
  advertiser_name?: string | null;
  advertiser_profile_picture?: string | null;
  advertiser_social_accounts?: { platform?: string | null; id?: string | null; followers?: number | null; category?: string | null }[] | null;
  error?: string | null;
}

/** Bright Data's flat record → the raw Meta Ad Library shape our normalizer reads. */
export function fromBrightData(ad: BrightDataAd): Record<string, unknown> | null {
  const id = ad.library_id ?? ad.url?.match(/[?&]id=(\d+)/)?.[1];
  if (!id) return null;
  const fb = (ad.advertiser_social_accounts ?? []).find((a) => (a.platform ?? "").toLowerCase() === "facebook");
  const video = ad.video_url ? [{ video_hd_url: ad.video_url, video_sd_url: null, video_preview_image_url: ad.video_preview_image ?? null }] : [];
  const images = !video.length && ad.image_url ? [{ original_image_url: ad.image_url, resized_image_url: ad.image_url }] : [];
  return {
    ad_archive_id: id,
    page_id: fb?.id ?? null,
    page_name: ad.advertiser_name ?? null,
    is_active: ad.is_active ?? true,
    start_date: ad.start_date ?? null,
    end_date: ad.end_date ?? null,
    collation_count: ad.versions_count ?? null,
    publisher_platform: (ad.platforms ?? []).map((p) => p.toUpperCase()),
    snapshot: {
      body: { text: ad.description ?? null },
      title: ad.title ?? null,
      caption: ad.caption ?? null,
      link_url: ad.link_url ?? null,
      link_description: ad.link_description ?? null,
      cta_text: ad.cta_text ?? null,
      cta_type: ad.cta_type ?? null,
      display_format: video.length ? "VIDEO" : "IMAGE",
      page_name: ad.advertiser_name ?? null,
      page_profile_picture_url: ad.advertiser_profile_picture ?? null,
      page_like_count: fb?.followers ?? null,
      page_categories: fb?.category ? [fb.category] : [],
      images,
      videos: video,
      cards: [],
    },
  };
}

const API = "https://api.brightdata.com/datasets/v3";
const DATASET = "gd_mtveskb62h7q65ftgz";

/**
 * Bright Data "Meta - Ad Library · discover by keyword". Slow (a job takes 1–3 minutes), so it sits last
 * in the chain. Keyword only: page-id queries throw so the chain moves on. Units = records billed.
 */
export const brightDataProvider: MetaAdsProvider = {
  id: "brightdata",
  label: "Bright Data",
  envKey: "BRIGHTDATA_API_TOKEN",
  // 5,000 free credits at $1.50 / 1k records; keep a safety margin.
  free: { units: 3000, period: "lifetime" },
  async fetchAds(token: string, q: AdQuery) {
    if (!q.q) throw new HttpError(400, "brightdata: keyword only");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const limit = Math.min(q.limit, 30);
    const trig = await fetchJson<{ snapshot_id?: string }>(
      `${API}/trigger?dataset_id=${DATASET}&type=discover_new&discover_by=keyword&include_errors=true&limit_per_input=${limit}`,
      { method: "POST", headers, body: JSON.stringify([{ keyword: q.q, country: q.country ?? "US", ad_type: "All ads" }]), timeoutMs: 30_000 },
    );
    if (!trig.snapshot_id) throw new HttpError(502, "brightdata: no snapshot");
    let status = "running";
    for (let i = 0; i < 60 && status !== "ready"; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const st = await fetchJson<{ status?: string }>(`${API}/progress/${trig.snapshot_id}`, { headers, timeoutMs: 20_000 });
      status = st.status ?? status;
      if (status === "failed") throw new HttpError(502, "brightdata: job failed");
    }
    if (status !== "ready") {
      await fetch(`${API}/snapshot/${trig.snapshot_id}/cancel`, { method: "POST", headers }).catch(() => undefined);
      throw new HttpError(504, "brightdata: timed out");
    }
    const rows = await fetchJson<BrightDataAd[]>(`${API}/snapshot/${trig.snapshot_id}?format=json`, { headers, timeoutMs: 60_000 });
    const good = (Array.isArray(rows) ? rows : []).filter((r) => !r.error);
    const items = good.map(fromBrightData).filter((x): x is Record<string, unknown> => !!x);
    return { items, units: good.length };
  },
};
