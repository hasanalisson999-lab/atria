"use client";

import { ArrowUpRight, BadgeCheck, Globe2, Loader2, Plus, Search, SearchX, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addBrandFromMeta, searchMetaPages, type MetaBrandResult } from "@/app/search-actions";
import { BrandAvatar } from "@/components/brand-avatar";
import { IgnoreButton, TrackButton } from "@/components/brands/track-button";
import type { BrandIndexRow, BrandListRow } from "@/lib/server/ads";
import { normName } from "@/lib/norm";
import { cn } from "@/lib/utils";
import { useUrlState } from "@/lib/url-state";

const SORTS = [
  { id: "launching", label: "Launching now" },
  { id: "live", label: "Most live ads" },
  { id: "proven", label: "Longest runners" },
  { id: "az", label: "A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

const compact = (n: number | null) => (n == null ? null : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n));

/** Brand directory: find any brand instantly (library first, then Meta), your competitors pinned, creative-first cards. */
export function BrandDirectory({
  rows,
  competitors,
  myName,
  tab,
  index,
  category,
}: {
  rows: BrandListRow[];
  competitors: BrandListRow[];
  myName: string | null;
  tab: string;
  index: BrandIndexRow[];
  category: string | null;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useUrlState<Sort>("sort", "launching", SORTS.map((x) => x.id));
  const inputRef = useRef<HTMLInputElement>(null);
  const dq = useDeferredValue(q.trim());
  const shown = useMemo(() => {
    const by: Record<Sort, (a: BrandListRow, b: BrandListRow) => number> = {
      launching: (a, b) => b.new_14d - a.new_14d || b.active_ads - a.active_ads,
      live: (a, b) => b.active_ads - a.active_ads,
      proven: (a, b) => (b.longest_days ?? 0) - (a.longest_days ?? 0),
      az: (a, b) => a.name.localeCompare(b.name),
    };
    return [...rows].sort(by[sort]);
  }, [rows, sort]);

  // Hundreds of cards with three images each are heavy: render a page at a time and add more on scroll.
  const PAGE = 60;
  const [visible, setVisible] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible((v) => v + PAGE), { rootMargin: "1200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown.length, visible]);

  // "/" focuses the search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === "/" && !(el && ["INPUT", "TEXTAREA"].includes(el.tagName))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <label className="group/s relative flex h-14 items-center">
        <Search className="pointer-events-none absolute left-5 size-5 text-muted-foreground transition-colors group-focus-within/s:text-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Find any brand: in your library or anywhere on Meta…"
          autoComplete="off"
          spellCheck={false}
          className="h-full w-full rounded-[20px] border bg-card pr-12 pl-14 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-foreground/30 focus:shadow-[0_0_0_4px_var(--pink-soft)]"
        />
        {q ? (
          <button onClick={() => setQ("")} className="absolute right-4 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Clear">
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-4 grid h-7 min-w-7 place-items-center rounded-lg border bg-surface px-1.5 font-mono text-xs text-muted-foreground">/</kbd>
        )}
      </label>

      {dq ? (
        <FindResults q={dq} index={index} category={category} />
      ) : (
        <>
          {competitors.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{myName ? `${myName}'s competitors` : "Your competitors"}</h2>
                <Link href="/tracking" className="text-xs text-muted-foreground hover:text-foreground">
                  Open competitor watch →
                </Link>
              </div>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {competitors.map((b) => (
                  <Link
                    key={b.id}
                    href={`/brands/${b.id}`}
                    className="group/c flex w-56 shrink-0 items-center gap-3 rounded-2xl border bg-card p-3 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
                  >
                    <BrandAvatar name={b.name} src={b.logo_url} fallbackSrc={b.logo_small} className="size-10" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{b.name}</span>
                      <span className={cn("text-xs", b.new_14d ? "text-pink-ink dark:text-pink" : "text-muted-foreground")}>{b.new_14d ? `+${b.new_14d} new ads` : `${b.active_ads} live`}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-0.5 rounded-full border bg-card p-1">
              {SORTS.map((s) => (
                <button key={s.id} onClick={() => setSort(s.id)} className={cn("relative h-8 rounded-full px-3 text-xs font-medium transition-colors", sort === s.id ? "text-ink-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {sort === s.id && <motion.span layoutId="brand-sort" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <span className="relative">{s.label}</span>
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{shown.length} brands</span>
          </div>

          {shown.length ? (
            <motion.ul layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <AnimatePresence initial={false}>
                {shown.slice(0, visible).map((b, i) => (
                  <BrandCard key={b.id} b={b} index={i} />
                ))}
              </AnimatePresence>
            </motion.ul>
          ) : null}
          {shown.length > visible && <div ref={sentinel} aria-hidden className="h-px" />}
          {shown.length ? null : (
            <div className="flex flex-col items-center gap-2 rounded-[26px] border p-12 text-center">
              <SearchX className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">{tab === "tracked" ? "You're not tracking anyone yet" : "Nothing here yet"}</p>
              <p className="max-w-sm text-xs text-muted-foreground">Search any brand above, or press Track on a brand to follow its new ads.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Library matches instantly as you type; anything not in the library is looked up on Meta (~1s) and added in one click. */
function FindResults({ q, index, category }: { q: string; index: BrandIndexRow[]; category: string | null }) {
  const router = useRouter();
  const n = normName(q);
  const lib = useMemo(() => {
    const ql = q.toLowerCase();
    const score = (b: BrandIndexRow) => {
      const bn = normName(b.name);
      return bn === n ? 0 : bn.startsWith(n) ? 1 : bn.includes(n) ? 2 : (b.domain ?? "").includes(ql) ? 3 : 9;
    };
    return index
      .map((b) => ({ b, s: score(b) }))
      .filter((x) => x.s < 9)
      .sort((a, z) => a.s - z.s || z.b.ads - a.b.ads)
      .slice(0, 24)
      .map((x) => x.b);
  }, [index, n, q]);
  const exact = lib.some((b) => normName(b.name) === n);

  const [meta, setMeta] = useState<{ q: string; brands: MetaBrandResult[] } | null>(null);
  const [loadingQ, setLoadingQ] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  // Library has nothing: look it up on Meta automatically. Library has partial matches: one click away (saves credits).
  const [askedQ, setAskedQ] = useState<string | null>(null);
  const auto = !lib.length || askedQ === q;
  useEffect(() => {
    if (q.length < 2 || exact || !auto) return;
    let live = true;
    const t = setTimeout(async () => {
      setLoadingQ(q);
      const r = await searchMetaPages(q);
      if (!live) return;
      setLoadingQ(null);
      if (r.ok) setMeta({ q, brands: r.brands });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, exact, auto]);

  const current = meta && meta.q === q ? meta : null;
  const fresh = current ? current.brands.filter((b) => !b.known_brand_id) : [];
  const add = async (b: MetaBrandResult) => {
    setAdding(b.name);
    const t = toast.loading(`Adding ${b.name}…`);
    const r = await addBrandFromMeta({ pages: b.pages, name: b.name, niche: category });
    setAdding(null);
    if (r.ok) {
      toast.success(`${b.name} added · first ads arrive in seconds`, { id: t });
      router.push(`/brands/${r.brandId}`);
    } else toast.error(r.error, { id: t, duration: 10000 });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          In your library <span className="font-normal text-muted-foreground">· {lib.length}</span>
        </h2>
        {lib.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lib.map((b, i) => (
              <motion.li key={b.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.02 }}>
                <Link href={`/brands/${b.id}`} className="group/r flex items-center gap-3 rounded-2xl border bg-card p-3 transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-[var(--shadow-card)]">
                  <BrandAvatar name={b.name} src={b.logo_url} fallbackSrc={b.logo_small} className="size-11" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{b.name}</span>
                    <span className="truncate text-xs text-muted-foreground capitalize">{[b.category, `${b.ads} ads`, b.status === "tracked" ? "tracking" : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover/r:translate-x-0.5 group-hover/r:-translate-y-0.5" />
                </Link>
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No brand called &ldquo;{q}&rdquo; in your library yet.</p>
        )}
      </section>

      {!exact && (
        <section className="flex flex-col gap-3">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Globe2 className="size-4" /> On Meta <span className="font-normal text-muted-foreground">· add any brand, its ads arrive in seconds</span>
          </h2>
          {!auto && !current ? (
            <button onClick={() => setAskedQ(q)} className="inline-flex h-10 w-fit items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:bg-secondary">
              <Search className="size-4" /> Search Meta for &ldquo;{q}&rdquo;
            </button>
          ) : !current && (loadingQ || q.length >= 2) ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer h-[70px] rounded-2xl" />
              ))}
            </div>
          ) : fresh.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {fresh.map((b) => (
                <li key={b.name} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                  <BrandAvatar name={b.name} src={`https://graph.facebook.com/${b.pages[0]!.page_id}/picture?type=large&width=400&height=400`} fallbackSrc={b.image} className="size-11" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1 truncate font-semibold">
                      {b.name}
                      {b.verified && <BadgeCheck className="size-3.5 shrink-0 text-sky-500" />}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{[b.category, b.likes ? `${compact(b.likes)} followers` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <button
                    onClick={() => void add(b)}
                    disabled={!!adding}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-xs font-semibold text-ink-foreground transition-opacity hover:opacity-85 disabled:opacity-40"
                  >
                    {adding === b.name ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
                  </button>
                </li>
              ))}
            </ul>
          ) : current ? (
            <p className="text-sm text-muted-foreground">Nothing else on Meta matches &ldquo;{q}&rdquo;. Try the exact brand name.</p>
          ) : null}
        </section>
      )}
    </div>
  );
}

function BrandCard({ b, index }: { b: BrandListRow; index: number }) {
  const [big, ...rest] = b.thumbs;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, delay: Math.min(index, 12) * 0.025, ease: [0.22, 1, 0.36, 1] }}
      className="group/b relative flex flex-col gap-3 rounded-[26px] border bg-card p-2 transition-[box-shadow,border-color] duration-300 hover:border-foreground/15 hover:shadow-[var(--shadow-lift)]"
    >
      <Link href={`/brands/${b.id}`} className="absolute inset-0 z-[1] rounded-[26px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Open ${b.name}`} />
      {/* Their creatives, front and center */}
      <div className="grid aspect-[16/11] grid-cols-3 grid-rows-2 gap-1 overflow-hidden rounded-[20px] bg-surface-2">
        <Thumb src={big} className="col-span-2 row-span-2" />
        <Thumb src={rest[0]} />
        <Thumb src={rest[1]} />
      </div>
      <div className="flex items-center gap-3 px-2">
        <BrandAvatar name={b.name} src={b.logo_url} fallbackSrc={b.logo_small} className="size-10" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1 truncate font-semibold tracking-[-0.01em]">
            {b.name}
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/b:opacity-100" />
          </span>
          <span className="truncate text-xs text-muted-foreground">{b.domain ?? (compact(b.page_likes) ? `${compact(b.page_likes)} followers` : "—")}</span>
        </div>
        <div className="relative z-[2] flex items-center gap-1">
          <span className="opacity-0 transition-opacity group-hover/b:opacity-100">
            <IgnoreButton brandId={b.id} status={b.status} />
          </span>
          <TrackButton brandId={b.id} status={b.status} size="sm" />
        </div>
      </div>
      <div className="flex items-center gap-x-3 gap-y-1 border-t px-2 pt-2.5 pb-1.5 text-xs text-muted-foreground">
        <span>
          <b className="font-semibold text-foreground tabular-nums">{b.active_ads}</b> live
        </span>
        {b.new_14d > 0 && (
          <span className="inline-flex items-center gap-1 text-pink-ink dark:text-pink">
            <span className="size-1.5 rounded-full bg-pink" />+{b.new_14d} in 14d
          </span>
        )}
        {b.longest_days != null && b.longest_days >= 30 && <span className="ml-auto tabular-nums">{b.longest_days}d best run</span>}
      </div>
    </motion.li>
  );
}

function Thumb({ src, className }: { src?: string; className?: string }) {
  if (!src) return <span className={cn("bg-surface", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote ad creative
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={cn("size-full object-cover transition-transform duration-700 ease-[var(--ease-out-quart)] group-hover/b:scale-[1.04]", className)}
    />
  );
}
