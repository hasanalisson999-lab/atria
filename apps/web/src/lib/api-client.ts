"use client";

import type { AdDetail } from "@/lib/server/ads";
import type { SyncProgress } from "@/lib/server/brand-sync";

type Fail = { ok: false; error: string };

async function json<T>(url: string, init?: RequestInit): Promise<T | Fail> {
  try {
    const res = await fetch(url, init);
    return (await res.json()) as T;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Ad detail for the popup (parallel fetch, never blocked by other requests). */
export const fetchAd = (id: string) => json<{ ok: true; ad: AdDetail } | Fail>(`/api/ads/${id}`, { cache: "no-store" });
/** Run (or re-run) the AI breakdown for an ad. */
export const fetchAnalysis = (id: string) => json<{ ok: true; message?: string } | Fail>(`/api/ads/${id}/analyze`, { method: "POST" });
/** Background brand-sync progress. */
export const fetchSyncStatus = async (id: string): Promise<SyncProgress | null> => {
  const r = await json<SyncProgress | null>(`/api/sync/${id}`, { cache: "no-store" });
  return r && "state" in r ? r : null;
};
