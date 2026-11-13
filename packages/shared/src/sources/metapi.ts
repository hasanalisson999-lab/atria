import type { Queryable } from "../db/client.ts";
import { HttpError, fetchJson } from "../retry.ts";
import type { AdQuery, MetaAdsProvider } from "./providers.ts";

/** One ad as Metapi returns it (Meta's archive data, flattened into arrays). */
export interface MetapiAd {
  provider_id: string;
  provider_page_id?: string | null;
  provider_page_name?: string | null;
  page_profile_id?: string | null;
  status?: string | null;
  delivery_start_time?: string | null;
  delivery_stop_time?: string | null;
  cta_text?: string | null;
  collation_id?: string | null;
  data_sources?: string[] | null;
  countries?: string[] | null;
  bodies?: string[] | null;
  creative_link_titles?: string[] | null;
  creative_link_descriptions?: string[] | null;
  captions?: string[] | null;
  query_params?: string | null;
  original_image_url?: string[] | null;
  video_hd_url?: string[] | null;
  video_sd_url?: string[] | null;
  video_previews?: string[] | null;
}

const first = (a?: string[] | null) => (Array.isArray(a) ? (a.find((x) => typeof x === "string" && x.trim()) ?? null) : null);

/** Metapi's flattened ad → the raw Meta Ad Library shape our normalizer reads. */
export function fromMetapi(ad: MetapiAd): Record<string, unknown> {
  const hd = ad.video_hd_url ?? [];
  const sd = ad.video_sd_url ?? [];
  const previews = ad.video_previews ?? [];
  const videos = Array.from({ length: Math.max(hd.length, sd.length) }, (_, i) => ({ video_hd_url: hd[i] ?? null, video_sd_url: sd[i] ?? null, video_preview_image_url: previews[i] ?? null })).filter(
    (v) => v.video_hd_url || v.video_sd_url,
  );
  const images = videos.length ? [] : [...new Set(ad.original_image_url ?? [])].map((u) => ({ original_image_url: u, resized_image_url: u }));
  const link = ad.query_params && /^https?:\/\//.test(ad.query_params) ? ad.query_params : null;
  return {
    ad_archive_id: ad.provider_id,
    page_id: ad.provider_page_id ?? null,
    page_name: ad.provider_page_name ?? null,
    is_active: (ad.status ?? "").toUpperCase() === "ACTIVE",
    start_date: ad.delivery_start_time ?? null,
    end_date: ad.delivery_stop_time ?? null,
    collation_id: ad.collation_id ?? null,
    publisher_platform: ad.data_sources ?? [],
    targeted_or_reached_countries: (ad.countries ?? []).filter((c) => c !== "ALL"),
    snapshot: {
      body: { text: first(ad.bodies) },
      title: first(ad.creative_link_titles),
      link_description: first(ad.creative_link_descriptions),
      caption: first(ad.captions),
      link_url: link,
      cta_text: ad.cta_text ?? null,
      page_name: ad.provider_page_name ?? null,
      display_format: videos.length ? "VIDEO" : images.length > 1 ? "CAROUSEL" : "IMAGE",
      images,
      videos,
    },
  };
}

const API = "https://api.metapi.io/v1";
const FREE_RECORDS = 3000;

/**
 * Metapi: Meta Ad Library search as async tasks (create → poll status → page through results).
 * Free plan: 3,000 records a month, 1,000 requests a day. Records are what the ledger counts.
 */
export const metapiProvider: MetaAdsProvider = {
  id: "metapi",
  label: "Metapi",
  envKey: "METAPI_API_KEY",
  free: { units: FREE_RECORDS, period: "month" },
  async available(db: Queryable, q: AdQuery) {
    const [row] = await db.query<{ used: string | number }>(
      "select coalesce(sum(units), 0) as used from public.cost_ledger where provider = 'metapi' and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'",
    );
    return Number(row?.used ?? 0) + q.limit <= FREE_RECORDS;
  },
  async fetchAds(apiKey: string, q: AdQuery) {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const body = q.pageId
      ? { advertiser_id: q.pageId, count: q.limit, active_status: "active", country: q.country ?? "ALL" }
      : { q: q.q ?? "", count: q.limit, active_status: "active", country: q.country ?? "ALL" };
    const task = await fetchJson<{ task_id?: string; status?: string }>(`${API}/tasks`, { method: "POST", headers, body: JSON.stringify(body), timeoutMs: 60_000 });
    if (!task.task_id) throw new HttpError(502, "metapi: no task id");
    // Tasks usually finish in a few seconds; give them up to ~2 minutes.
    let status = task.status ?? "running";
    for (let i = 0; i < 60 && !["succeeded", "completed", "failed", "error", "cancelled"].includes(status); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await fetchJson<{ status?: string; error_message?: string | null }>(`${API}/tasks/${task.task_id}/status`, { headers, timeoutMs: 30_000 });
      status = st.status ?? status;
      if (status === "failed" || status === "error") throw new HttpError(502, `metapi task failed: ${st.error_message ?? ""}`.slice(0, 200));
    }
    if (status !== "succeeded" && status !== "completed") throw new HttpError(504, "metapi task timed out");
    const items: unknown[] = [];
    for (let offset = 0; items.length < q.limit; ) {
      const page = await fetchJson<{ data?: MetapiAd[]; pagination?: { has_more?: boolean } }>(`${API}/tasks/${task.task_id}/results?offset=${offset}&limit=100`, {
        headers,
        timeoutMs: 60_000,
      });
      const data = page.data ?? [];
      items.push(...data.map(fromMetapi));
      offset += data.length;
      if (!data.length || !page.pagination?.has_more) break;
    }
    return { items: items.slice(0, q.limit), units: items.length };
  },
};
