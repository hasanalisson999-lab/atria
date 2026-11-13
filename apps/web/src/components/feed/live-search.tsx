"use client";

import { Loader2, Radar } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { liveSearchAds } from "@/app/live-search-actions";

/**
 * Keyword search beyond the library: pulls matching ads from the public Meta Ad Library (free sources),
 * keeps established brands only, and refreshes the results. Runs automatically when nothing matched.
 */
export function LiveSearch({ q, found }: { q: string; found: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const autoRan = useRef(false);

  const run = () =>
    start(async () => {
      const r = await liveSearchAds(q);
      if (!r.ok) {
        toast.error(r.error);
        setResult(r.error);
        return;
      }
      setResult(r.added ? `Found ${r.added} new ads${r.brands.length ? ` from ${r.brands.slice(0, 4).join(", ")}${r.brands.length > 4 ? "…" : ""}` : ""}` : "No new branded ads for this keyword right now.");
      router.refresh();
    });

  // Nothing in the library yet: search the Ad Library straight away (once per keyword).
  useEffect(() => {
    if (found > 0 || autoRan.current) return;
    autoRan.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-pink">{pending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}</span>
      <span className="min-w-0 flex-1 text-muted-foreground">
        {pending ? (
          <>
            Searching the Meta Ad Library for <b className="text-foreground">&ldquo;{q}&rdquo;</b>…
          </>
        ) : result ? (
          result
        ) : (
          <>
            {found.toLocaleString()} ads in your library match <b className="text-foreground">&ldquo;{q}&rdquo;</b>. Want more from brands you don&apos;t have yet?
          </>
        )}
      </span>
      {!pending && !result && (
        <button onClick={run} className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-ink-foreground transition-transform active:scale-95">
          Search the Ad Library
        </button>
      )}
    </div>
  );
}
