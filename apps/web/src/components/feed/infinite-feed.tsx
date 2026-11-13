"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadMoreFeed } from "@/app/feed-actions";
import { AdGrid } from "@/components/feed/ad-grid";
import type { FeedAd, FeedParams } from "@/lib/server/ads";

/**
 * Endless feed: starts with the server-rendered page, then loads the next page as you near the bottom.
 * Same filters and same seed, so nothing reshuffles while you scroll.
 */
export function InfiniteFeed({ initial, params, total }: { initial: FeedAd[]; params: Omit<FeedParams, "seed" | "limit" | "offset">; total: number }) {
  const [ads, setAds] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length >= total);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((e) => e.isIntersecting) || busy.current) return;
        busy.current = true;
        setLoading(true);
        const r = await loadMoreFeed(params, ads.length);
        busy.current = false;
        setLoading(false);
        if (!r.ok || !r.ads.length) return setDone(true);
        setAds((cur) => {
          const seen = new Set(cur.map((a) => a.id));
          const next = [...cur, ...r.ads.filter((a) => !seen.has(a.id))];
          if (next.length >= total || next.length === cur.length) setDone(true);
          return next;
        });
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ads.length, done, params, total]);

  return (
    <>
      <AdGrid ads={ads} />
      <div ref={sentinel} className="flex h-20 items-center justify-center text-sm text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading more ads…
          </span>
        ) : done ? (
          <span>You&apos;ve seen all {ads.length.toLocaleString()} ads here. Press New batch for a fresh mix.</span>
        ) : null}
      </div>
    </>
  );
}
