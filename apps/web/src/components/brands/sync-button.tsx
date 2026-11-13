"use client";

import { Check, DownloadCloud, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { syncBrand } from "@/app/search-actions";
import { fetchSyncStatus } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Progress = Awaited<ReturnType<typeof fetchSyncStatus>>;

/**
 * "Fetch all ads": starts a background sync (returns instantly), then shows live progress and refreshes
 * the page when new ads land. Picks up a sync that is already running (e.g. right after adding a brand).
 */
export function SyncButton({ brandId, name, autoStart = false }: { brandId: string; name: string; autoStart?: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<Progress>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAds = useRef(0);

  const [tick, setTick] = useState(0);

  // Poll the background sync: every 2.5s while it runs; refresh the page whenever a batch lands.
  useEffect(() => {
    let live = true;
    void fetchSyncStatus(brandId).then((s) => {
      if (!live) return;
      setP(s);
      if (s?.state === "running") {
        if (s.ads > lastAds.current) {
          lastAds.current = s.ads;
          router.refresh();
        }
        timer.current = setTimeout(() => setTick((t) => t + 1), 1200);
      } else if (s && s.finishedAt && Date.now() - s.finishedAt < 15_000) {
        router.refresh();
        if (s.state === "done") toast.success(s.newAds ? `${name}: ${s.newAds} new ads added` : `${name} is up to date: no new ads since the last fetch`, { id: `sync-${brandId}` });
        else toast.error(s.error ?? "Sync failed", { id: `sync-${brandId}`, duration: 10_000 });
      }
    });
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tick, brandId, name, router]);

  const start = async () => {
    setStarting(true);
    const r = await syncBrand(brandId);
    setStarting(false);
    if (!r.ok) return toast.error(r.error, { duration: 10_000 });
    lastAds.current = 0;
    setTick((t) => t + 1);
  };

  // Brands with very few ads collect the rest automatically, once per session.
  useEffect(() => {
    if (!autoStart) return;
    const key = `atria.autosync.${brandId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    // start() sets state only via an async server call (a deliberate one-off kick-off on mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, autoStart]);


  const running = starting || p?.state === "running";
  const pct = p && p.pagesTotal ? Math.round((p.pagesDone / p.pagesTotal) * 100) : 0;
  return (
    <button
      onClick={() => void start()}
      disabled={running}
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-full border bg-card px-3.5 text-sm font-medium transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-[var(--shadow-card)] disabled:cursor-progress",
        running && "border-pink/50",
      )}
    >
      {running && <span className="absolute inset-y-0 left-0 bg-pink-soft transition-[width] duration-700 ease-[var(--ease-out-quart)]" style={{ width: `${Math.max(8, pct)}%` }} />}
      <span className="relative inline-flex items-center gap-1.5 whitespace-nowrap">
        {running ? <Loader2 className="size-4 animate-spin" /> : p?.state === "done" ? <Check className="size-4 text-ok" /> : <DownloadCloud className="size-4" />}
        {running ? (p && p.ads > 0 ? `Collecting… ${p.ads} ads` : "Collecting ads…") : "Fetch all ads"}
      </span>
    </button>
  );
}
