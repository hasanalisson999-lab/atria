"use client";

import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BrandAvatar } from "@/components/brand-avatar";
import { SyncButton } from "@/components/brands/sync-button";
import { TrackButton } from "@/components/brands/track-button";
import { AdGrid } from "@/components/feed/ad-grid";
import type { FeedAd } from "@/lib/server/ads";
import type { CompetitorMove, WatchData } from "@/lib/server/tracking";
import { useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const DAY = 864e5;

// ------------------------------------------------------------------ helpers

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / DAY);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const fmtDate = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
/** Start of each 8 weekly buckets (oldest first); the last bucket is the 7 days up to today. */
const weekStarts = () => Array.from({ length: 8 }, (_, i) => new Date(Date.now() - ((7 - i) * 7 + 6) * DAY));
const weekName = (i: number, starts: Date[]) => (i === 7 ? "Last 7 days" : `Week of ${fmtDate(starts[i]!)}`);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const daysOld = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(`${iso.slice(0, 10)}T00:00:00`).getTime()) / DAY) : 99);

function summary(m: CompetitorMove): string {
  const parts: string[] = [];
  if (m.new7) parts.push(`launched ${m.new7} new ad${m.new7 > 1 ? "s" : ""} this week`);
  else if (m.new30) parts.push(`launched ${m.new30} new ads in the last 30 days`);
  if (m.scaling) parts.push(`is scaling ${m.scaling}`);
  if (m.stopped7) parts.push(`switched off ${m.stopped7}`);
  const s = parts.join(", ");
  return s ? `${m.name} ${s}.` : `${m.name} has no new ads lately.`;
}

/**
 * Deals ads out round-robin across brands (each brand's newest first), so one brand that launched 40 ads
 * in a day can't fill the whole grid. Brands whose newest ad is most recent go first in every round.
 * Expects `ads` sorted newest first.
 */
function mixBrands(ads: FeedAd[]): FeedAd[] {
  const queues = new Map<string, FeedAd[]>();
  for (const a of ads) {
    const k = a.brand_id ?? a.brand_name ?? a.id;
    queues.set(k, [...(queues.get(k) ?? []), a]);
  }
  const lists = [...queues.values()];
  const out: FeedAd[] = [];
  for (let round = 0; out.length < ads.length; round++) for (const l of lists) if (l[round]) out.push(l[round]!);
  return out;
}

const FORMATS = [
  { key: "video", label: "Video" },
  { key: "image", label: "Image" },
  { key: "carousel", label: "Carousel" },
  { key: "dynamic", label: "Dynamic" },
] as const;
const mixTotal = (m: CompetitorMove) => FORMATS.reduce((n, f) => n + (m.mix?.[f.key] ?? 0), 0);

// ------------------------------------------------------------------ tooltip

function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const bind = (content: ReactNode) => ({
    onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, content });
    },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div role="tooltip" className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-lg" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  ) : null;
  return { bind, node };
}

// ------------------------------------------------------------------ app

/**
 * Tracking: a quiet left rail (Overview + every competitor) and one view at a time on the right.
 * /tracking is the overview, /tracking/<brandId> a competitor. Switching is instant (no server round trip).
 */
export function TrackingApp({ data, brandName, extras }: { data: WatchData; brandName: string | null; extras: ReactNode }) {
  const parts = usePathname().split("/").filter(Boolean);
  const selected = data.moves.find((m) => m.id === parts[1]) ?? null;
  const starts = weekStarts();

  const go = (id: string | null) => {
    const url = id ? `/tracking/${id}` : "/tracking";
    if (window.location.pathname !== url) window.history.pushState(null, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12">
      <Rail moves={data.moves} selectedId={selected?.id ?? null} onSelect={go} />
      <div className="min-w-0">
        <motion.div key={selected?.id ?? "overview"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}>
          {selected ? (
            <Competitor m={selected} ads={data.launches[selected.id] ?? []} winners={data.winners.filter((w) => w.brand_id === selected.id)} starts={starts} onBack={() => go(null)} />
          ) : (
            <Overview data={data} brandName={brandName} starts={starts} onSelect={go} extras={extras} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ rail

const SORTS = [
  { id: "week", label: "This week" },
  { id: "live", label: "Live" },
  { id: "az", label: "A–Z" },
] as const;

function Rail({ moves, selectedId, onSelect }: { moves: CompetitorMove[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [sort, setSort] = useUrlState<(typeof SORTS)[number]["id"]>("sort", "week", SORTS.map((s) => s.id));
  const list = [...moves].sort((a, b) => (sort === "live" ? b.live - a.live : sort === "az" ? a.name.localeCompare(b.name) : b.new7 - a.new7 || b.live - a.live));
  const value = (m: CompetitorMove) => (sort === "live" ? m.live : m.new7);
  return (
    <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6.5rem)]">
      <nav aria-label="Competitors" className="flex h-full flex-col gap-4">
        <button
          onClick={() => onSelect(null)}
          aria-current={!selectedId ? "page" : undefined}
          className={cn("flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors", !selectedId ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}
        >
          Overview
        </button>

        <div className="flex items-center justify-between px-3">
          <span className="text-[0.68rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">Competitors · {moves.length}</span>
        </div>
        <div className="-mt-2 flex gap-3 px-3 text-xs">
          {SORTS.map((s) => (
            <button key={s.id} onClick={() => setSort(s.id)} className={cn("transition-colors", sort === s.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {s.label}
            </button>
          ))}
        </div>

        <ol className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-px lg:overflow-y-auto">
          {list.map((m) => {
            const on = m.id === selectedId;
            const v = value(m);
            return (
              <li key={m.id} className="shrink-0">
                <button
                  onClick={() => onSelect(m.id)}
                  aria-current={on ? "page" : undefined}
                  className={cn("flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors", on ? "bg-secondary font-semibold text-foreground" : "text-foreground/80 hover:bg-secondary/60")}
                >
                  <BrandAvatar name={m.name} src={m.logo_url} fallbackSrc={m.logo_small} className="size-6 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {sort !== "az" && <span className={cn("shrink-0 text-xs tabular-nums", sort === "week" && v > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>{sort === "week" && v > 0 ? `+${v}` : v}</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <Link href="/brands" className="hidden h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground lg:flex">
          <Plus className="size-4" /> Add competitor
        </Link>
      </nav>
    </aside>
  );
}

// ------------------------------------------------------------------ shared pieces

function Section({ title, hint, action, children, className }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-5 border-t pt-8", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em]">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stats({ items }: { items: { label: string; value: ReactNode; note?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 border-y sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ "--n": items.length } as React.CSSProperties}>
      {items.map((s, i) => (
        <div key={s.label} className={cn("flex flex-col gap-1.5 py-5", i % 2 === 1 && "pl-5 max-sm:border-l", i > 0 && "sm:border-l sm:pl-6", i >= 2 && "max-sm:border-t")}>
          <dt className="text-[0.8rem] text-muted-foreground">{s.label}</dt>
          <dd className="text-[1.9rem] leading-none font-semibold tracking-[-0.03em] tabular-nums">{s.value}</dd>
          {s.note && <span className="text-xs text-muted-foreground">{s.note}</span>}
        </div>
      ))}
    </dl>
  );
}

/** Weekly columns: one ink, the current week in the accent and labelled; the rest are in the tooltip. */
function WeekChart({ values, starts, height = "h-44" }: { values: number[]; starts: Date[]; height?: string }) {
  const { bind, node } = useTip();
  const max = Math.max(1, ...values);
  return (
    <figure className="flex flex-col gap-2">
      <div className={cn("flex items-end gap-2 border-b", height)}>
        {values.map((v, i) => (
          <button key={i} type="button" {...bind(`${weekName(i, starts)} · ${v} new`)} aria-label={`${weekName(i, starts)}: ${v} new ads`} className="group/c flex h-full flex-1 items-end outline-none">
            <span className="flex w-full flex-col items-center justify-end gap-1" style={{ height: `${Math.max(v ? 3 : 1, (v / max) * 100)}%` }}>
              {i === 7 && <span className="text-xs font-semibold tabular-nums">{v}</span>}
              <motion.span
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: EASE }}
                style={{ transformOrigin: "bottom" }}
                className={cn("w-full flex-1 rounded-t-[4px] transition-colors", i === 7 ? "bg-pink" : "bg-foreground/15 group-hover/c:bg-foreground/30 group-focus-visible/c:bg-foreground/30")}
              />
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 text-[0.68rem] text-muted-foreground">
        {values.map((_, i) => (
          <span key={i} className={cn("flex-1 text-center", i === 7 && "font-medium text-foreground")}>
            {i === 7 ? "Now" : fmtDate(starts[i]!)}
          </span>
        ))}
      </div>
      {node}
    </figure>
  );
}

// ------------------------------------------------------------------ overview

const WINDOWS = [
  { id: "today", label: "Today", max: 0 },
  { id: "yesterday", label: "Yesterday", max: 1 },
  { id: "7d", label: "7 days", max: 6 },
  { id: "14d", label: "14 days", max: 13 },
] as const;

function Overview({ data, brandName, starts, onSelect, extras }: { data: WatchData; brandName: string | null; starts: Date[]; onSelect: (id: string) => void; extras: ReactNode }) {
  const { moves, launches, totals, winners } = data;
  const weekly = Array.from({ length: 8 }, (_, i) => moves.reduce((n, m) => n + (m.spark?.[i] ?? 0), 0));
  const delta = weekly[6] ? Math.round((((weekly[7] ?? 0) - weekly[6]) / weekly[6]) * 100) : null;
  const synced = moves.map((m) => m.synced_at).filter(Boolean).sort().at(-1) ?? null;
  const active = [...moves].filter((m) => m.new7 > 0).sort((a, b) => b.new7 - a.new7);
  const maxNew = Math.max(1, ...active.map((m) => m.new7));
  const all = Object.values(launches)
    .flat()
    .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  const counts = Object.fromEntries(WINDOWS.map((w) => [w.id, all.filter((a) => (w.id === "yesterday" ? daysOld(a.start_date) === 1 : daysOld(a.start_date) <= w.max)).length]));
  const [win, setWin] = useUrlState<(typeof WINDOWS)[number]["id"]>("window", "7d", WINDOWS.map((w) => w.id));
  const [more, setMore] = useState(false);
  const w = WINDOWS.find((x) => x.id === win)!;
  const shown = mixBrands(all.filter((a) => (w.id === "yesterday" ? daysOld(a.start_date) === 1 : daysOld(a.start_date) <= w.max)));
  const videoLive = moves.reduce((n, m) => n + (m.mix?.video ?? 0), 0);
  const mixAll = moves.reduce((n, m) => n + mixTotal(m), 0);

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[0.78rem] font-medium text-muted-foreground">
            Tracking{brandName ? ` · ${brandName}` : ""}
            {synced ? ` · updated ${ago(synced)}` : ""}
          </span>
        </div>
        <h1 className="max-w-3xl text-[2.3rem] leading-[1.1] font-semibold tracking-[-0.035em] text-balance sm:text-[2.9rem]">
          {totals.new7} new ads from your {totals.tracked} competitors <span className="text-muted-foreground">this week.</span>
        </h1>
        {delta !== null && (
          <p className="text-[0.95rem] text-muted-foreground">
            <span className={cn("font-medium", delta >= 0 ? "text-ok" : "text-foreground")}>
              {delta >= 0 ? "+" : ""}
              {delta}%
            </span>{" "}
            compared with last week{active[0] ? `. ${active[0].name} launched the most (${active[0].new7}).` : "."}
          </p>
        )}
      </header>

      <Stats
        items={[
          { label: "New this week", value: totals.new7 },
          { label: "Being scaled", value: totals.scaling, note: "3+ live versions" },
          { label: "Switched off", value: totals.stopped7, note: "last 7 days" },
          { label: "Live right now", value: totals.live, note: `${pct(videoLive, mixAll)}% video` },
        ]}
      />

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="New ads per week" hint="All competitors, last 8 weeks" className="border-t-0 pt-0">
          <WeekChart values={weekly} starts={starts} />
        </Section>
        <Section title="Most active this week" hint="Click a brand to see everything they're running" className="border-t-0 pt-0">
          <ol className="flex flex-col">
            {active.slice(0, 7).map((m, i) => (
              <li key={m.id}>
                <button onClick={() => onSelect(m.id)} className="group/r grid w-full grid-cols-[18px_24px_minmax(0,9rem)_minmax(0,1fr)_36px] items-center gap-3 py-2 text-left text-sm">
                  <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <BrandAvatar name={m.name} src={m.logo_url} fallbackSrc={m.logo_small} className="size-6" />
                  <span className="truncate font-medium group-hover/r:underline">{m.name}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(m.new7 / maxNew) * 100}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: EASE }} className="block h-full rounded-full bg-foreground/70" />
                  </span>
                  <span className="text-right font-medium tabular-nums">{m.new7}</span>
                </button>
              </li>
            ))}
            {!active.length && <li className="py-6 text-sm text-muted-foreground">Nobody launched anything this week.</li>}
          </ol>
        </Section>
      </div>

      <Section
        title="Latest launches"
        hint="A mix of every brand you track, newest first"
        action={
          <div className="inline-flex h-8 items-center rounded-full bg-secondary p-0.5">
            {WINDOWS.map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  setWin(x.id);
                  setMore(false);
                }}
                className={cn("relative h-7 rounded-full px-3 text-[0.78rem] font-medium transition-colors", win === x.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {win === x.id && <motion.span layoutId="trk-window" className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className="relative">
                  {x.label} <span className="text-muted-foreground tabular-nums">{counts[x.id]}</span>
                </span>
              </button>
            ))}
          </div>
        }
      >
        {shown.length ? (
          <>
            <AdGrid ads={shown.slice(0, more ? 120 : 24)} />
            {shown.length > 24 && !more && (
              <button onClick={() => setMore(true)} className="self-center rounded-full border px-5 py-2 text-sm font-medium transition-colors hover:bg-secondary">
                Show more ({shown.length - 24})
              </button>
            )}
          </>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">No launches in this window.</p>
        )}
      </Section>

      {winners.length > 0 && (
        <Section title="Proven winners" hint="Still running after 30+ days, so they're paying for these">
          <AdGrid ads={mixBrands(winners)} layout="row" />
        </Section>
      )}

      {extras}
    </div>
  );
}

// ------------------------------------------------------------------ competitor

function Competitor({ m, ads, winners, starts, onBack }: { m: CompetitorMove; ads: FeedAd[]; winners: FeedAd[]; starts: Date[]; onBack: () => void }) {
  const total = mixTotal(m);
  const fresh = [...ads].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-6">
        <button onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-[0.82rem] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Overview
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <BrandAvatar name={m.name} src={m.logo_url} fallbackSrc={m.logo_small} className="size-14" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link href={`/brands/${m.id}`} className="group/n inline-flex w-fit items-center gap-1.5 text-[2rem] leading-tight font-semibold tracking-[-0.03em]">
              {m.name}
              <ArrowUpRight className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover/n:opacity-100" />
            </Link>
            <p className="text-[0.95rem] text-muted-foreground">
              {summary(m)} Last launch {ago(m.last_launch)}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncButton brandId={m.id} name={m.name} />
            <TrackButton brandId={m.id} status="tracked" size="sm" />
          </div>
        </div>
      </header>

      <Stats
        items={[
          { label: "New this week", value: m.new7 },
          { label: "New in 30 days", value: m.new30 },
          { label: "Being scaled", value: m.scaling },
          { label: "Live right now", value: m.live },
          { label: "Longest running", value: m.longest_live ?? 0, note: "days" },
        ]}
      />

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section title="New ads per week" hint="Last 8 weeks" className="border-t-0 pt-0">
          <WeekChart values={m.spark} starts={starts} height="h-40" />
        </Section>
        <Section title="What they run" hint={`${total} live ads by format${m.top_cta ? ` · most say “${m.top_cta}”` : ""}`} className="border-t-0 pt-0">
          <ul className="flex flex-col gap-3.5">
            {FORMATS.map((f, i) => {
              const v = m.mix?.[f.key] ?? 0;
              return (
                <li key={f.key} className="grid grid-cols-[72px_minmax(0,1fr)_72px] items-center gap-3 text-sm">
                  <span>{f.label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${pct(v, total)}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: EASE }} className="block h-full rounded-full bg-foreground/70" />
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="font-medium">{pct(v, total)}%</span> <span className="text-xs text-muted-foreground">{v}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <Section title="New in the last 14 days" hint={fresh.length ? `${fresh.length} ads, newest first` : undefined}>
        {fresh.length ? <AdGrid ads={fresh.slice(0, 60)} /> : <p className="py-10 text-center text-sm text-muted-foreground">Nothing new in the last 14 days. Press Fetch all ads to check again.</p>}
      </Section>

      {winners.length > 0 && (
        <Section title="Their proven winners" hint="Still running after 30+ days">
          <AdGrid ads={winners} layout="row" />
        </Section>
      )}
    </div>
  );
}
