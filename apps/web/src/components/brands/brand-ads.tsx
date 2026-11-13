"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { useUrlState } from "@/lib/url-state";
import { AdGrid } from "@/components/feed/ad-grid";
import type { FeedAd } from "@/lib/server/ads";
import { cn } from "@/lib/utils";

type Platform = "all" | "meta" | "tiktok";
type Sort = "newest" | "longest";

const isTikTok = (a: FeedAd) => a.platforms.includes("tiktok");

function Segmented<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: { v: T; label: string; n?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-secondary p-1 text-xs">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={cn("relative rounded-full px-3 py-1.5 font-medium transition-colors", value === o.v ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {value === o.v && <motion.span layoutId={id} className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
          <span className="relative">
            {o.label}
            {o.n != null && <span className="ml-1 font-mono text-[0.62rem] text-muted-foreground">{o.n}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Every ad of a brand, across Facebook/Instagram and TikTok, filtered and sorted instantly. */
export function BrandAds({ ads }: { ads: FeedAd[] }) {
  const [platform, setPlatform] = useUrlState<Platform>("platform", "all", ["all", "meta", "tiktok"]);
  const [sort, setSort] = useUrlState<Sort>("sort", "newest", ["newest", "longest"]);
  const tiktok = ads.filter(isTikTok).length;
  const list = useMemo(() => {
    const f = ads.filter((a) => platform === "all" || (platform === "tiktok" ? isTikTok(a) : !isTikTok(a)));
    return [...f].sort((a, b) => (sort === "longest" ? (b.days_running ?? 0) - (a.days_running ?? 0) : (b.start_date ?? "").localeCompare(a.start_date ?? "")));
  }, [ads, platform, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          id="brand-platform"
          value={platform}
          onChange={setPlatform}
          options={[
            { v: "all", label: "All", n: ads.length },
            { v: "meta", label: "Facebook & Instagram", n: ads.length - tiktok },
            { v: "tiktok", label: "TikTok", n: tiktok },
          ]}
        />
        <Segmented
          id="brand-sort"
          value={sort}
          onChange={setSort}
          options={[
            { v: "newest", label: "Newest first" },
            { v: "longest", label: "Longest running" },
          ]}
        />
      </div>
      {list.length ? (
        <AdGrid key={`${platform}-${sort}`} ads={list} />
      ) : (
        <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
          {platform === "tiktok" ? "No TikTok ads found for this brand yet. Fetch all ads checks the TikTok Ad Library too." : "No ads here yet. Press “Fetch all ads” to collect them."}
        </p>
      )}
    </div>
  );
}
