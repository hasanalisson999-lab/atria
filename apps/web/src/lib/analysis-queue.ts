"use client";

import { fetchAnalysis } from "@/lib/api-client";

type Result = Awaited<ReturnType<typeof fetchAnalysis>>;

/** At most 2 hover-prefetched breakdowns at a time, so a click is never stuck behind a backlog. */
let inflight = 0;

/** One breakdown request per ad per tab, shared by hover-prefetch and the popup. */
const pending = new Map<string, Promise<Result>>();
const done = new Set<string>();

export function ensureAnalysis(adId: string): Promise<Result> {
  const cur = pending.get(adId);
  if (cur) return cur;
  inflight++;
  const p = fetchAnalysis(adId).then((r) => {
    inflight--;
    if (r.ok) done.add(adId);
    else pending.delete(adId); // allow a retry after a failure
    return r;
  });
  pending.set(adId, p);
  return p;
}

/** Start a breakdown in the background (e.g. while the pointer rests on a tile). */
export function prefetchAnalysis(adId: string, alreadyAnalyzed: boolean) {
  if (alreadyAnalyzed || done.has(adId) || pending.has(adId) || inflight >= 2) return;
  void ensureAnalysis(adId);
}
