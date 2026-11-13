"use server";

import { type FeedAd, getAdsByIds, getSimilarAds } from "@/lib/server/ads";

type Similar = FeedAd & { opening: string | null };

export interface HookExploration {
  /** This brand's ads that open with the hook. */
  same: FeedAd[];
  /** This brand's other ads with the closest meaning (same angle, different words). */
  related: Similar[];
}

/** One hook of one brand: where the brand used it, and the brand's other ads on the same angle. */
export async function exploreHook(text: string, brandId: string, adIds: string[]): Promise<{ ok: true; data: HookExploration } | { ok: false; error: string }> {
  const hook = text.trim().slice(0, 300);
  if (hook.length < 3) return { ok: false, error: "Hook is too short" };
  const ids = adIds.filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 24);
  const [same, related] = await Promise.all([getAdsByIds(ids), getSimilarAds(hook, { onlyBrandId: brandId, excludeIds: ids, limit: 9 })]);
  if (!same.ok) return { ok: false, error: same.reason };
  if (!related.ok) return { ok: false, error: related.reason };
  return { ok: true, data: { same: same.data, related: related.data } };
}

/** Opt-in comparison: the closest hooks from other brands in the library. */
export async function compareHook(text: string, brandId: string): Promise<{ ok: true; data: Similar[] } | { ok: false; error: string }> {
  const hook = text.trim().slice(0, 300);
  if (hook.length < 3) return { ok: false, error: "Hook is too short" };
  const r = await getSimilarAds(hook, { excludeBrandId: brandId, limit: 9 });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.reason };
}
