"use server";

import { cookies } from "next/headers";
import { type FeedAd, type FeedParams, getFeed, newFeedSeed } from "@/lib/server/ads";
import { SEED_COOKIE, SEED_TTL_S } from "@/lib/session";

/** "New batch": a new seed for the next hour. Already-seen ads sink, so the batch is genuinely new. */
export async function newFeedBatch(): Promise<void> {
  (await cookies()).set(SEED_COOKIE, newFeedSeed(), { maxAge: SEED_TTL_S, path: "/", sameSite: "lax" });
}

/** Infinite scroll: the next page of the same feed (same filters, same seed). */
export async function loadMoreFeed(params: Omit<FeedParams, "seed" | "limit" | "offset">, offset: number): Promise<{ ok: true; ads: FeedAd[] } | { ok: false; error: string }> {
  const seed = (await cookies()).get(SEED_COOKIE)?.value;
  const r = await getFeed({ ...params, seed, offset: Math.max(0, Math.min(offset, 5000)), limit: 36 });
  return r.ok ? { ok: true, ads: r.data.ads } : { ok: false, error: r.reason };
}
