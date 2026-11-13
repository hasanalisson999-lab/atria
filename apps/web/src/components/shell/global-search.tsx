"use client";

import { ArrowRight, BadgeCheck, CornerDownLeft, Globe2, Loader2, Plus, Search, Sparkles, Tag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addBrandFromMeta, searchAll, searchMetaPages, type MetaBrandResult, type SearchResults } from "@/app/search-actions";
import { useAdPanel } from "@/components/ad/ad-panel";
import { BrandAvatar } from "@/components/brand-avatar";
import { normName } from "@/lib/norm";
import { cn } from "@/lib/utils";

const compact = (n: number | null) => (n == null ? "" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n));

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-pink-soft px-0.5 text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const NICHES = [
  { id: "footwear", label: "👟 Footwear" },
  { id: "apparel", label: "👕 Apparel" },
  { id: "supplements", label: "💊 Supplements" },
  { id: null, label: "Other" },
] as const;

/**
 * Search everything as you type: brands, ads, keywords from the library, and, when the library has
 * no exact brand match, any real brand on Meta (auto-searched after a short pause, cached).
 */
export function GlobalSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const panel = useAdPanel();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [meta, setMeta] = useState<{ q: string; brands: MetaBrandResult[] } | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [nichePick, setNichePick] = useState<string | null>(null);
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runMeta = useCallback(async (term: string, id: number) => {
    setMetaLoading(true);
    const r = await searchMetaPages(term);
    if (id !== reqId.current) return;
    setMetaLoading(false);
    if (r.ok) setMeta({ q: term, brands: r.brands });
  }, []);

  const search = (value: string) => {
    setQ(value);
    setOpen(true);
    setMeta(null);
    setNichePick(null);
    if (timer.current) clearTimeout(timer.current);
    if (metaTimer.current) clearTimeout(metaTimer.current);
    const term = value.trim();
    const id = ++reqId.current;
    if (!term) {
      setRes(null);
      setLoading(false);
      setMetaLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const r = await searchAll(term);
      if (id !== reqId.current) return;
      setRes(r);
      setActive(0);
      setLoading(false);
      // No exact brand in the library → look the brand up on Meta automatically after a pause.
      const exact = r.brands.some((b) => normName(b.name) === normName(term));
      if (term.length >= 3 && !exact) metaTimer.current = setTimeout(() => void runMeta(term, id), 380);
    }, 110);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    const onDown = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);

  const term = q.trim();
  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const add = async (b: MetaBrandResult, niche: string | null) => {
    setAdding(b.name);
    const t = toast.loading(`Adding ${b.name}…`);
    const r = await addBrandFromMeta({ pages: b.pages, name: b.name, niche });
    setAdding(null);
    setNichePick(null);
    if (r.ok) {
      toast.success(`${b.name} added and tracked · collecting every public ad in the background`, { id: t });
      close();
      router.push(`/brands/${r.brandId}`);
    } else toast.error(r.error, { id: t, duration: 10000 });
  };

  const keys: string[] = useMemo(
    () => [
      ...(res?.brands ?? []).map((b) => `b-${b.id}`),
      ...(res?.ads ?? []).map((a) => `a-${a.id}`),
      ...(res?.keywords ?? []).map((k) => `k-${k}`),
      ...(term ? ["all"] : []),
    ],
    [res, term],
  );

  function runItem(key: string | undefined) {
    if (!key) return;
    close();
    if (key === "all") return router.push(`/discover?q=${encodeURIComponent(term)}`);
    const id = key.slice(2);
    if (key.startsWith("b-")) return router.push(`/brands/${id}`);
    if (key.startsWith("k-")) return router.push(`/discover?niche=everything&q=${encodeURIComponent(id)}`);
    if (key.startsWith("a-")) panel.open(id, (res?.ads ?? []).map((x) => ({ id: x.id, thumbnail_url: x.thumbnail_url })));
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (!open) setOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(keys.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Nothing in the library yet: Enter looks the brand up on Meta right away.
      if (!res?.brands.length && !res?.ads.length && term.length >= 2 && !meta && !metaLoading) {
        if (metaTimer.current) clearTimeout(metaTimer.current);
        return void runMeta(term, reqId.current);
      }
      runItem(keys[active]);
    }
  };

  const idx = (key: string) => keys.indexOf(key);
  const rowCls = (key: string) => cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", idx(key) === active ? "bg-secondary" : "hover:bg-secondary/60");
  const newBrands = (meta?.brands ?? []).filter((b) => !b.known_brand_id);
  const showPanel = open && term.length > 0;

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-2xl">
      <Search className={cn("pointer-events-none absolute top-1/2 left-4 z-10 size-[1.1rem] -translate-y-1/2 text-muted-foreground transition-colors", open && "text-pink-ink dark:text-pink")} />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => search(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search brands, ads, hooks or keywords…"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        className={cn(
          "relative h-11 w-full rounded-2xl border border-transparent bg-secondary/70 pr-14 pl-11 text-[0.92rem] outline-none transition-[box-shadow,border-color,background-color] duration-200 placeholder:text-muted-foreground",
          "hover:bg-secondary focus:border-border focus:bg-card focus:shadow-[0_10px_40px_-12px_rgb(0_0_0/0.25)]",
        )}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <kbd className="grid h-7 min-w-7 place-items-center rounded-lg border bg-card px-1.5 font-mono text-[0.72rem] text-muted-foreground shadow-sm">/</kbd>}
      </span>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            id="global-search-results"
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-full z-50 mt-2 max-h-[min(74vh,680px)] overflow-y-auto rounded-2xl border bg-popover p-2 shadow-2xl"
          >
            {res && res.brands.length > 0 && (
              <section className="mb-1">
                <p className="eyebrow px-2.5 pt-1 pb-1.5">Brands in Atria</p>
                {res.brands.map((b) => (
                  <Link key={b.id} href={`/brands/${b.id}`} onClick={close} onMouseEnter={() => setActive(idx(`b-${b.id}`))} className={rowCls(`b-${b.id}`)}>
                    <BrandAvatar name={b.name} src={b.logo} fallbackSrc={b.logo_small} className="size-8" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        <Highlight text={b.name} q={term} />
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{[b.category, `${b.ads} creatives`, b.domain].filter(Boolean).join(" · ")}</span>
                    </span>
                    {b.status === "tracked" && <span className="rounded-full bg-ink px-2 py-0.5 text-[0.62rem] font-medium text-ink-foreground">Tracking</span>}
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </Link>
                ))}
              </section>
            )}

            {(metaLoading || newBrands.length > 0) && (
              <section className="mb-1 rounded-xl bg-surface/70 p-1">
                <p className="eyebrow flex items-center gap-1.5 px-2 pt-1 pb-1.5">
                  <Globe2 className="size-3" /> Found on Meta · add to Atria
                </p>
                {metaLoading && (
                  <div className="flex items-center gap-2 px-2.5 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Looking up &ldquo;{term}&rdquo; on Meta…
                  </div>
                )}
                {newBrands.map((b) => (
                  <div key={b.name} className="flex flex-col gap-2 rounded-xl px-2.5 py-2 hover:bg-card">
                    <div className="flex items-center gap-3">
                      <BrandAvatar name={b.name} src={`https://graph.facebook.com/${b.pages[0]!.page_id}/picture?type=large&width=200&height=200`} fallbackSrc={b.image} className="size-9" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-1 truncate text-sm font-medium">
                          {b.name}
                          {b.verified && <BadgeCheck className="size-3.5 shrink-0 text-sky-500" />}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[b.category, b.likes ? `${compact(b.likes)} followers` : null, b.pages.length > 1 ? `${b.pages.length} regional pages` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {nichePick !== b.name && (
                        <button
                          disabled={!!adding}
                          onClick={() => setNichePick(b.name)}
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-ink px-3 text-xs font-semibold text-ink-foreground transition-opacity hover:opacity-85 disabled:opacity-40"
                        >
                          {adding === b.name ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add brand
                        </button>
                      )}
                    </div>
                    {nichePick === b.name && (
                      <div className="flex animate-enter flex-wrap items-center gap-1.5 pl-12">
                        <span className="text-xs text-muted-foreground">Niche:</span>
                        {NICHES.map((n) => (
                          <button
                            key={n.label}
                            disabled={!!adding}
                            onClick={() => add(b, n.id)}
                            className="inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5 text-xs font-medium transition-colors hover:border-pink hover:bg-pink-soft disabled:opacity-40"
                          >
                            {adding === b.name ? <Loader2 className="size-3 animate-spin" /> : null}
                            {n.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {res && res.ads.length > 0 && (
              <section className="mb-1">
                <p className="eyebrow flex items-center justify-between px-2.5 pt-1 pb-1.5">
                  <span>Ads</span>
                  <span className="normal-case">{res.totalAds.toLocaleString()} matches</span>
                </p>
                {res.ads.map((a) => (
                  <button key={a.id} onClick={() => runItem(`a-${a.id}`)} onMouseEnter={() => setActive(idx(`a-${a.id}`))} className={rowCls(`a-${a.id}`)}>
                    <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {a.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnail_url} alt="" referrerPolicy="no-referrer" className="size-full object-cover" loading="lazy" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        <Highlight text={a.headline ?? a.body ?? "Ad"} q={term} />
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {a.brand} · {a.format}
                        {a.days_running != null ? ` · ${a.days_running}d running` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            )}

            {res && res.keywords.length > 0 && (
              <section className="mb-1">
                <p className="eyebrow px-2.5 pt-1 pb-1.5">Keywords</p>
                {res.keywords.map((k) => (
                  <button key={k} onClick={() => runItem(`k-${k}`)} onMouseEnter={() => setActive(idx(`k-${k}`))} className={rowCls(`k-${k}`)}>
                    <Tag className="size-4 text-muted-foreground" />
                    <span className="text-sm">
                      <Highlight text={k} q={term} />
                    </span>
                  </button>
                ))}
              </section>
            )}

            {res && !res.brands.length && !res.ads.length && !metaLoading && !newBrands.length && !loading && (
              <p className="px-3 py-3 text-sm text-muted-foreground">Nothing found for &ldquo;{term}&rdquo;.</p>
            )}

            <div className="mt-1 border-t pt-2">
              <button onClick={() => runItem("all")} onMouseEnter={() => setActive(idx("all"))} className={rowCls("all")}>
                <Sparkles className="size-4 text-pink-ink dark:text-pink" />
                <span className="flex-1 text-sm">
                  Search all ads for <span className="font-semibold">&ldquo;{term}&rdquo;</span>
                </span>
                <CornerDownLeft className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
