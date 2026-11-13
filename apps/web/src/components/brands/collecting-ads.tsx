"use client";

import { Megaphone } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchSyncStatus } from "@/lib/api-client";
import type { SyncProgress } from "@/lib/server/brand-sync";

const SHAPES = ["aspect-[4/5]", "aspect-square", "aspect-[9/16]", "aspect-[4/5]", "aspect-square", "aspect-[9/16]", "aspect-[4/5]", "aspect-square"];

/**
 * Shown on a brand's ad tab while it has no ads yet: live progress while ads are being collected
 * (new brands), the plain empty state once collection is finished.
 */
export function CollectingAds({ brandId, name, expecting }: { brandId: string; name: string; expecting: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<SyncProgress | null>(null);
  const [waited, setWaited] = useState(0);
  const seen = useRef(0);

  useEffect(() => {
    let live = true;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const s = await fetchSyncStatus(brandId);
      if (!live) return;
      setP(s);
      setWaited((w) => w + 1);
      if (s && s.ads > seen.current) {
        seen.current = s.ads;
        router.refresh();
      }
      if (!s || s.state === "running") t = setTimeout(poll, 1500);
      else router.refresh();
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [brandId, router]);

  // A sync is running, or one is about to start (the Fetch button kicks it off on open).
  const loading = p?.state === "running" || (!p && expecting && waited < 6);
  if (!loading)
    return (
      <div className="flex flex-col items-center gap-3 rounded-[24px] border bg-card px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-secondary">
          <Megaphone className="size-5" strokeWidth={1.75} />
        </span>
        <p className="font-display text-xl font-semibold tracking-[-0.03em]">{p?.state === "done" ? "No active ads right now" : "No ads yet"}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {p?.state === "done" ? `${name} isn't running any public ads at the moment. Track it to catch the next launch.` : "Press “Fetch all ads” to collect every public ad from this brand."}
        </p>
      </div>
    );

  const pct = p?.pagesTotal ? Math.round((p.pagesDone / p.pagesTotal) * 100) : 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4 rounded-[22px] border bg-card px-5 py-4">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-pink">
          <Megaphone className="size-4.5" />
          <span className="absolute inset-0 animate-ping rounded-xl bg-pink/25" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-semibold">Collecting {name}&apos;s ads</span>
          <span className="text-xs text-muted-foreground">
            {p?.ads ? `${p.ads} found so far · they appear here as they land` : "Asking the Ad Library… the first ads usually show up in a few seconds"}
          </span>
          <span className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
            <motion.span className="block h-full rounded-full bg-pink" initial={{ width: "6%" }} animate={{ width: `${Math.max(8, pct)}%` }} transition={{ duration: 0.6 }} />
          </span>
        </div>
      </div>
      <div className="columns-2 gap-4 lg:columns-3 2xl:columns-4">
        {SHAPES.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }} className={`skeleton-shimmer mb-4 break-inside-avoid rounded-[20px] ${s}`} />
        ))}
      </div>
    </div>
  );
}
