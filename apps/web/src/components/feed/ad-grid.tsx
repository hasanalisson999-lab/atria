"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAdPanel } from "@/components/ad/ad-panel";
import { AdByBrand, AdCinema, AdLedger } from "@/components/feed/ad-styles";
import { AdTile } from "@/components/feed/ad-tile";
import { useUiTheme } from "@/lib/ui-theme";
import type { FeedAd } from "@/lib/server/ads";
import { cn } from "@/lib/utils";

/** Big, clear tiles: at most 4 columns (2 on phones and small tablets, 3 on laptops). */
const QUERIES: [string, number][] = [
  ["(min-width: 1500px)", 4],
  ["(min-width: 1024px)", 3],
];
export function useMasonryColumns(): number {
  return useSyncExternalStore(subscribe, getCols, () => 4);
}
function getCols() {
  for (const [q, n] of QUERIES) if (window.matchMedia(q).matches) return n;
  return 2;
}
function subscribe(cb: () => void) {
  const mqs = QUERIES.map(([q]) => window.matchMedia(q));
  mqs.forEach((m) => m.addEventListener("change", cb));
  return () => mqs.forEach((m) => m.removeEventListener("change", cb));
}

/**
 * Masonry ad wall: every tile keeps its creative's real shape (square, 4:5, 9:16, landscape). Ads are dealt
 * left-to-right across columns so reading order matches the feed order, and "Load more" only appends.
 */
export function AdGrid({ ads, layout = "grid" }: { ads: FeedAd[]; layout?: "grid" | "row" }) {
  const panel = useAdPanel();
  const cols = useMasonryColumns();
  const open = useCallback((id: string) => panel.open(id, ads.map((a) => ({ id: a.id, thumbnail_url: a.thumbnail_url }))), [panel, ads]);
  const [ui] = useUiTheme();
  if (layout === "grid" && ui !== "atria") {
    const Layout = { cinema: AdCinema, ledger: AdLedger, pop: AdByBrand }[ui];
    return <Layout ads={ads} onOpen={open} openId={panel.openId} />;
  }
  if (layout === "row")
    return (
      <AdRow>
        {ads.map((ad, i) => (
          <div key={ad.id} className="w-[200px] shrink-0 sm:w-[230px]">
            <AdTile ad={ad} index={i} onOpen={open} selected={ad.id === panel.openId} />
          </div>
        ))}
      </AdRow>
    );
  const columns: { ad: FeedAd; i: number }[][] = Array.from({ length: cols }, () => []);
  ads.forEach((ad, i) => columns[i % cols]!.push({ ad, i }));
  return (
    <div className="flex items-start gap-4 sm:gap-5">
      {columns.map((col, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-5 sm:gap-6">
          {col.map(({ ad, i }) => (
            <AdTile key={ad.id} ad={ad} index={i} onOpen={open} selected={ad.id === panel.openId} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Sideways row of ads with hover arrows (the mouse wheel keeps scrolling the page). */
function AdRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
  const btn = "absolute top-[38%] z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border bg-card/95 shadow-[var(--shadow-lift)] backdrop-blur transition-[opacity,transform] duration-200 hover:scale-105 active:scale-95";
  return (
    <div className="group/row relative">
      <div ref={ref} onScroll={measure} className="no-scrollbar -mx-1 overflow-x-auto scroll-smooth px-1 pb-1">
        <div className="flex w-max items-start gap-3">{children}</div>
      </div>
      {!edge.start && (
        <button onClick={() => go(-1)} aria-label="Scroll left" className={cn(btn, "-left-3 opacity-0 group-hover/row:opacity-100")}>
          <ChevronLeft className="size-5" />
        </button>
      )}
      {!edge.end && (
        <button onClick={() => go(1)} aria-label="Scroll right" className={cn(btn, "-right-3 opacity-0 group-hover/row:opacity-100")}>
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}
