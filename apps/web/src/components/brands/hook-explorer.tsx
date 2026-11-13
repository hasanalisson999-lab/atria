"use client";

import { ArrowUp, ArrowUpRight, Copy, Flame, Loader2, MessageCircle, Play, Search, Sparkles, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { compareHook, exploreHook, type HookExploration } from "@/app/hook-actions";
import { studioAsk, type Citation } from "@/app/studio-actions";
import { useAdPanel } from "@/components/ad/ad-panel";
import { Answer } from "@/components/ai/answer";
import { BrandAvatar } from "@/components/brand-avatar";
import type { FeedAd } from "@/lib/server/ads";
import type { Hook } from "@/lib/server/brand-profile";
import { daysText } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sort = "longest" | "used" | "ai";

const QUICK = (brand: string) => [
  { label: "Why does it work?", q: "Explain in 3 short bullets why this hook works and which psychological trigger it uses." },
  { label: "5 variations for us", q: "Write 5 variations of this hook for our brand, same mechanism, different words. One line each." },
  { label: "Best opening visual", q: "Describe the best first 3 seconds of video to pair with this hook for our brand (shot list, max 5 lines)." },
  { label: `Who else does this?`, q: `Which other brands in the library use a similar angle to this ${brand} hook, and how do they differ?` },
];

/** Small creative thumb: full media (contain) over a blurred copy, opens the ad popup. */
function MiniAd({ ad, onOpen, caption, className }: { ad: FeedAd; onOpen: () => void; caption?: string | null; className?: string }) {
  return (
    <button onClick={onOpen} className={cn("group/mini flex min-w-0 flex-col gap-2 text-left", className)}>
      <span className="relative block w-full overflow-hidden rounded-xl bg-surface-2 transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover/mini:-translate-y-0.5">
        {ad.thumbnail_url ? (
          // The thumb keeps the creative's real shape: no crop, no blur.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.thumbnail_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="block h-auto w-full" />
        ) : (
          <span className="grid aspect-[4/5] place-items-center bg-surface p-3 text-center text-xs text-muted-foreground">{ad.headline ?? ad.body_text?.slice(0, 80) ?? "Text ad"}</span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-[opacity,background-color] duration-200 group-hover/mini:bg-black/25 group-hover/mini:opacity-100">
          <span className="grid size-9 place-items-center rounded-full bg-white text-black shadow-lg">
            <Play className="size-3.5 fill-current" />
          </span>
        </span>
        {(ad.days_running ?? 0) > 0 && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[0.6rem] text-white backdrop-blur">{daysText(ad.days_running)}</span>
        )}
      </span>
      {caption !== undefined && (
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <BrandAvatar name={ad.brand_name} src={ad.brand_logo} fallbackSrc={ad.brand_logo_small} className="size-5" />
            <span className="truncate text-xs font-semibold">{ad.brand_name}</span>
          </span>
          {caption && <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">&ldquo;{caption}&rdquo;</span>}
        </span>
      )}
    </button>
  );
}

function AskHook({ hook, brandName }: { hook: Hook; brandName: string }) {
  const [answers, setAnswers] = useState<{ q: string; text: string; citations: Citation[]; model?: string }[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const ask = (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    setInput("");
    start(async () => {
      const prompt = `${question}\n\nThe hook: "${hook.text}" — from ${brandName}, ran up to ${hook.maxDays} days across ${hook.ads} ad${hook.ads === 1 ? "" : "s"}. Keep the answer tight.`;
      const r = await studioAsk([{ role: "user", text: prompt }], null);
      if (r.ok) setAnswers((a) => [...a, { q: question, text: r.text, citations: r.citations, model: r.model }]);
      else toast.error(r.error);
    });
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-ink text-pink">
          <MessageCircle className="size-3.5" />
        </span>
        <span className="text-sm font-semibold">Ask AI about this hook</span>
        <Link href="/lab/ideas" className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Open in Studio <ArrowUpRight className="size-3" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK(brandName).map((s) => (
          <button
            key={s.label}
            disabled={pending}
            onClick={() => ask(s.q)}
            className="inline-flex items-center gap-1 rounded-full border bg-surface px-3 py-1.5 text-xs transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-pink/60 hover:bg-card disabled:opacity-50"
          >
            <Wand2 className="size-3 text-pink-ink dark:text-pink" />
            {s.label}
          </button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {answers.map((a, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 rounded-xl bg-surface p-3.5">
            <span className="text-xs font-medium text-muted-foreground">{a.q}</span>
            <Answer text={a.text} citations={a.citations} compact />
            {a.model && <span className="font-mono text-[0.6rem] text-muted-foreground/70">by {a.model} · free</span>}
          </motion.div>
        ))}
        {pending && (
          <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 rounded-xl bg-surface p-3.5">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Thinking with real ads from your library…
            </span>
            <div className="skeleton-shimmer h-3 w-11/12 rounded" />
            <div className="skeleton-shimmer h-3 w-9/12 rounded" />
            <div className="skeleton-shimmer h-3 w-10/12 rounded" />
          </motion.div>
        )}
      </AnimatePresence>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 rounded-full border bg-surface p-1 pl-4 transition-[border-color,box-shadow] focus-within:border-pink/60 focus-within:shadow-[0_0_0_4px_var(--pink-soft)]"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about this hook…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <button disabled={!input.trim() || pending} className="grid size-8 place-items-center rounded-full bg-pink text-[#0a0a0b] transition-[transform,opacity] hover:scale-105 disabled:opacity-40" aria-label="Ask">
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}

/** Other brands are opt-in, so the hooks tab stays about this brand. */
function CompareOthers({ hook, brandId, onOpen }: { hook: Hook; brandId: string; onOpen: (ads: FeedAd[], id: string) => void }) {
  const [state, setState] = useState<"idle" | "loading" | (FeedAd & { opening: string | null })[]>("idle");
  if (state === "idle")
    return (
      <button
        onClick={() => {
          setState("loading");
          void compareHook(hook.text, brandId).then((r) => setState(r.ok ? r.data : []));
        }}
        className="group/cmp flex items-center gap-2 self-start rounded-full border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Search className="size-3.5" /> Compare with other brands using this angle
      </button>
    );
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border p-4">
      <h4 className="text-[0.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Other brands, same angle</h4>
      {state === "loading" ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-shimmer aspect-[4/5] rounded-xl" />
          ))}
        </div>
      ) : state.length ? (
        <div className="stagger grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-3">
          {state.map((a) => (
            <MiniAd key={a.id} ad={a} caption={a.opening} onOpen={() => onOpen(state, a.id)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No close matches from other brands.</p>
      )}
    </section>
  );
}

export function HookExplorer({ hooks, brandId, brandName }: { hooks: Hook[]; brandId: string; brandName: string }) {
  const panel = useAdPanel();
  const [sel, setSel] = useState(0);
  const [sort, setSort] = useState<Sort>("longest");
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<Record<string, HookExploration | "error">>({});
  const detailRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const base = hooks.filter((h) => (!f || h.text.toLowerCase().includes(f)) && (sort !== "ai" || h.source === "ai"));
    return [...base].sort((a, b) => (sort === "used" ? b.ads - a.ads || b.maxDays - a.maxDays : b.maxDays - a.maxDays || b.ads - a.ads));
  }, [hooks, sort, filter]);
  const hook = list[Math.min(sel, Math.max(0, list.length - 1))];
  const key = hook ? `${hook.text}|${hook.exampleId}` : "";
  const ex = data[key];

  useEffect(() => {
    if (!hook || data[key]) return;
    let live = true;
    void exploreHook(hook.text, brandId, hook.adIds.length ? hook.adIds : [hook.exampleId]).then((r) => {
      if (live) setData((d) => ({ ...d, [key]: r.ok ? r.data : "error" }));
    });
    return () => {
      live = false;
    };
  }, [key, hook, brandId, data]);

  const pick = (i: number) => {
    setSel(i);
    if (window.innerWidth < 1024) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const open = (ads: FeedAd[], id: string) => panel.open(id, ads.map((a) => ({ id: a.id, thumbnail_url: a.thumbnail_url })));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Hook list */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-[7.75rem]">
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border bg-card px-3 focus-within:border-pink/60">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setSel(0);
              }}
              placeholder="Filter hooks"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div className="flex rounded-full bg-secondary p-0.5 text-xs">
            {(["longest", "used", "ai"] as Sort[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSort(s);
                  setSel(0);
                }}
                className={cn("relative rounded-full px-2.5 py-1 font-medium transition-colors", sort === s ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {sort === s && <motion.span layoutId="hook-sort" className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
                <span className="relative">{s === "longest" ? "Longest" : s === "used" ? "Most used" : "AI"}</span>
              </button>
            ))}
          </div>
        </div>
        <ol className="no-scrollbar flex max-h-[calc(100vh-12rem)] flex-col gap-1 overflow-y-auto pr-1">
          {list.map((h, i) => {
            const active = h === hook;
            return (
              <li key={`${h.text}-${h.exampleId}`}>
                <button
                  onClick={() => pick(i)}
                  className={cn(
                    "group/h relative flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors duration-200",
                    active ? "text-ink-foreground" : "hover:bg-secondary/70",
                  )}
                  style={{ animation: "var(--animate-enter)", animationDelay: `${Math.min(i, 14) * 22}ms` }}
                >
                  {active && <motion.span layoutId="hook-active" className="absolute inset-0 rounded-2xl bg-ink" transition={{ type: "spring", bounce: 0.18, duration: 0.45 }} />}
                  <span className={cn("relative mt-0.5 font-mono text-[0.68rem] tabular-nums", active ? "text-pink" : "text-muted-foreground")}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="relative flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="line-clamp-2 text-sm leading-snug font-medium">{h.text}</span>
                    <span className={cn("flex items-center gap-1.5 text-[0.68rem]", active ? "text-ink-foreground/65" : "text-muted-foreground")}>
                      {h.maxDays >= 30 && <Flame className="size-3 text-pink" />}
                      {h.maxDays}d · {h.ads} ad{h.ads === 1 ? "" : "s"}
                      {h.source === "ai" && (
                        <span className={cn("ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5", active ? "bg-ink-foreground/15" : "bg-pink-soft text-pink-ink")}>
                          <Sparkles className="size-2.5" /> AI
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No hooks match.</li>}
        </ol>
      </aside>

      {/* Detail */}
      <div ref={detailRef} className="scroll-mt-24">
        <AnimatePresence mode="wait">
          {hook && (
            <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }} className="flex flex-col gap-4">
              <div className="wash-pink relative flex flex-col gap-4 overflow-hidden rounded-[28px] border p-6">
                <span className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-wide text-pink-ink uppercase dark:text-pink">
                  <Sparkles className="size-3.5" /> {hook.source === "ai" ? "AI-detected video hook" : "Opening line"}
                </span>
                <p className="font-display text-[1.6rem] leading-[1.15] font-semibold tracking-[-0.03em] sm:text-[1.9rem]">&ldquo;{hook.text}&rdquo;</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1", hook.maxDays >= 30 ? "bg-ink text-ink-foreground" : "border bg-card")}>
                    {hook.maxDays >= 30 && <Flame className="size-3 text-pink" />} ran up to {hook.maxDays} days
                  </span>
                  <span className="rounded-full border bg-card px-2.5 py-1">
                    {hook.ads} ad{hook.ads === 1 ? "" : "s"}
                  </span>
                  {hook.active > 0 && <span className="rounded-full bg-ok-soft px-2.5 py-1 text-ok">{hook.active} live now</span>}
                  <span className="ml-auto flex gap-1.5">
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(hook.text);
                        toast.success("Hook copied");
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 font-medium transition-colors hover:bg-secondary"
                    >
                      <Copy className="size-3.5" /> Copy
                    </button>
                    <button onClick={() => panel.open(hook.exampleId, [{ id: hook.exampleId }])} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 font-medium text-ink-foreground">
                      <Play className="size-3 fill-current" /> Watch ad
                    </button>
                  </span>
                </div>
              </div>

              <AskHook key={key} hook={hook} brandName={brandName} />

              {/* Where the brand used it */}
              <section className="flex flex-col gap-2.5">
                <h4 className="text-[0.75rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {brandName} ads with this hook {ex && ex !== "error" ? `· ${ex.same.length}` : ""}
                </h4>
                {!ex ? (
                  <div className="flex gap-2.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="skeleton-shimmer aspect-[4/5] w-28 shrink-0 rounded-xl" />
                    ))}
                  </div>
                ) : ex === "error" ? (
                  <p className="text-sm text-muted-foreground">Couldn&apos;t load these ads.</p>
                ) : (
                  <div className="no-scrollbar -mx-1 flex items-start gap-2.5 overflow-x-auto px-1 pb-1">
                    {ex.same.map((a) => (
                      <MiniAd key={a.id} ad={a} onOpen={() => open(ex.same, a.id)} className="w-28 shrink-0" />
                    ))}
                  </div>
                )}
              </section>

              {/* The brand's own ads on the same angle */}
              <section className="flex flex-col gap-2.5">
                <h4 className="flex items-center gap-2 text-[0.75rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  More {brandName} ads on this angle
                  {ex && ex !== "error" && <span className="rounded-full bg-secondary px-2 py-px font-mono text-[0.65rem] normal-case">{ex.related.length}</span>}
                </h4>
                {!ex ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton-shimmer aspect-[4/5] rounded-xl" />
                    ))}
                  </div>
                ) : ex === "error" || !ex.related.length ? (
                  <p className="rounded-2xl border p-5 text-center text-sm text-muted-foreground">This is the only {brandName} ad on this angle so far.</p>
                ) : (
                  <div className="stagger grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-3">
                    {ex.related.map((a) => (
                      <MiniAd key={a.id} ad={a} caption={a.opening} onOpen={() => open(ex.related, a.id)} />
                    ))}
                  </div>
                )}
              </section>

              <CompareOthers key={`cmp-${key}`} hook={hook} brandId={brandId} onOpen={open} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
