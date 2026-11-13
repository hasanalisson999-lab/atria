"use client";

import { AlertCircle, ChevronsLeft, ChevronsRight, Clapperboard, Images, Lightbulb, Loader2, Palette, RefreshCw, RotateCcw, ScanText, Shuffle, Target, WandSparkles, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandAvatar } from "@/components/brand-avatar";
import { AdGrid } from "@/components/feed/ad-grid";
import type { FeedAd } from "@/lib/server/ads";
import type { Branding, Ideas, LabEntry, LabSection, Positioning, Remix, Scripts } from "@/lib/server/lab";
import { useFold } from "@/lib/fold";
import { setPath } from "@/lib/slop";
import { cn } from "@/lib/utils";
import { HumanCheck } from "./human-check";
import { ago, card, EASE, HumanBadge, useSlop, Writing } from "./lab-ui";
import { ScriptsView } from "./scripts-view";
import { BrandingView, IdeasView, PositioningView, RemixView } from "./strategy-views";

export type LabTab = "scripts" | "check" | "positioning" | "branding" | "ideas" | "inspiration" | "remix";

interface NavEntry {
  id: LabTab;
  label: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
}

const GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: "Create",
    items: [
      { id: "scripts", label: "Video scripts", icon: Clapperboard, title: "Video scripts", blurb: "Scripts you film yourself for TikTok, Reels and YouTube. Each one is checked for AI-sounding lines before you see it." },
      { id: "check", label: "Human check", icon: ScanText, title: "Human check", blurb: "Paste any script, caption or copy. It flags every AI pattern and rewrites it in your voice." },
    ],
  },
  {
    label: "Strategy",
    items: [
      { id: "positioning", label: "Positioning", icon: Target, title: "Positioning", blurb: "What the shoe is, who it's for, and the words that sell it." },
      { id: "branding", label: "Branding", icon: Palette, title: "Branding", blurb: "Personality, voice, colours, type, logo concepts and names for the first shoe." },
      { id: "ideas", label: "Ad ideas", icon: Lightbulb, title: "Ad ideas", blurb: "Eight concepts to shoot, each built on a competitor ad that's still running." },
    ],
  },
  {
    label: "Research",
    items: [{ id: "inspiration", label: "Inspiration", icon: Images, title: "Inspiration", blurb: "Your competitors' ads that have run the longest. Open one and press Remix to make your own version." }],
  },
];
const REMIX: NavEntry = { id: "remix", label: "Remix", icon: Shuffle, title: "Remix", blurb: "Three versions of a proven ad, rewritten for your brand." };

const TABS = new Set<LabTab>(["scripts", "check", "positioning", "branding", "ideas", "inspiration", "remix"]);
const AI_TABS: Partial<Record<LabTab, LabSection>> = { scripts: "scripts", positioning: "positioning", branding: "branding", ideas: "ideas", remix: "remix" };

/** The Brand Lab: organic scripts, a human-writing check, positioning, branding, ad ideas and real-ad inspiration. */
export function LabApp({
  brand,
  entries: initialEntries,
  profile,
  inspiration,
  remix,
}: {
  brand: { name: string; logo: string | null; products: string; price: string | null; category: string };
  entries: Partial<Record<LabSection, LabEntry>>;
  profile: string;
  inspiration: FeedAd[];
  remix: { adId: string; entry: LabEntry | null } | null;
}) {
  // The URL is the source of truth: /lab/<section>[/<scriptId or adId>].
  const parts = usePathname().split("/").filter(Boolean);
  const tab: LabTab = TABS.has(parts[1] as LabTab) && (parts[1] !== "remix" || remix) ? (parts[1] as LabTab) : "scripts";
  const scriptId = tab === "scripts" ? (parts[2] ?? null) : null;
  // The chapter of a document section: /lab/positioning/taglines, /lab/ideas/3, /lab/remix/<adId>/v2.
  const chapter = (tab === "remix" ? parts[3] : parts[2]) ?? null;
  const [entries, setEntries] = useState<Partial<Record<LabSection, LabEntry>>>({ ...initialEntries, ...(remix?.entry ? { remix: remix.entry } : {}) });
  const [busy, setBusy] = useState<Partial<Record<LabSection, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<LabSection, string>>>({});
  const started = useRef(new Set<string>());
  const [folded, toggleFold] = useFold("labnav");

  // Switching sections is instant (no server round trip) but still a real history entry, so Back works.
  const setTab = (t: LabTab) => {
    if (t === tab) return;
    window.history.pushState(null, "", t === "remix" && remix ? `/lab/remix/${remix.adId}` : `/lab/${t}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Picking a script replaces the URL (no history entry per click), so a refresh reopens it.
  // Picking a script or a chapter is a real history entry, so Back returns to the previous one.
  const selectScript = useCallback((id: string | null) => {
    const url = id ? `/lab/scripts/${id}` : "/lab/scripts";
    if (window.location.pathname !== url) window.history.pushState(null, "", url + window.location.search);
  }, []);

  const selectChapter = useCallback(
    (id: string) => {
      const base = tab === "remix" && remix ? `/lab/remix/${remix.adId}` : `/lab/${tab}`;
      if (window.location.pathname !== `${base}/${id}`) window.history.pushState(null, "", `${base}/${id}`);
    },
    [tab, remix],
  );

  /** Click-to-edit in Positioning, Branding, Ideas and Remix: shown at once, saved in the background. */
  const edit = useCallback(
    (section: LabSection) => (path: string, value: string) => {
      setEntries((x) => {
        const e = x[section];
        if (!e) return x;
        const data = structuredClone(e.data) as Record<string, unknown>;
        setPath(data, path, value);
        return { ...x, [section]: { ...e, data } };
      });
      void fetch(`/api/lab/${section}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, value, adId: remix?.adId }) })
        .then((r) => r.json() as Promise<{ ok: boolean; error?: string }>)
        .then((j) => !j.ok && setErrors((er) => ({ ...er, [section]: j.error ?? "Couldn't save that edit" })))
        .catch(() => setErrors((er) => ({ ...er, [section]: "Couldn't save that edit. Check your connection." })));
    },
    [remix?.adId],
  );

  const run = useCallback(
    async (section: LabSection, opts: { fix?: boolean } = {}) => {
      setBusy((b) => ({ ...b, [section]: true }));
      setErrors((e) => ({ ...e, [section]: undefined }));
      try {
        const res = await fetch(`/api/lab/${section}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adId: remix?.adId, fix: opts.fix }) });
        const j = (await res.json()) as { ok: true; entry: LabEntry } | { ok: false; error: string };
        if (j.ok) setEntries((x) => ({ ...x, [section]: j.entry }));
        else setErrors((e) => ({ ...e, [section]: j.error }));
      } catch (err) {
        setErrors((e) => ({ ...e, [section]: err instanceof Error ? err.message : "Network error" }));
      } finally {
        setBusy((b) => ({ ...b, [section]: false }));
      }
    },
    [remix?.adId],
  );

  // A section that was never generated is written the first time it's opened.
  useEffect(() => {
    const section = AI_TABS[tab];
    if (!section || entries[section] || started.current.has(section)) return;
    started.current.add(section);
    void run(section);
  }, [tab, entries, run]);

  const all = [...GROUPS.flatMap((g) => g.items), REMIX];
  const current = all.find((n) => n.id === tab) ?? all[0]!;
  const section = AI_TABS[tab] ?? null;
  const entry = section ? entries[section] : undefined;
  const scriptCount = ((entries.scripts?.data as Scripts | undefined)?.scripts ?? []).length;
  const counts: Partial<Record<LabTab, number>> = { scripts: scriptCount || undefined, inspiration: inspiration.length || undefined };
  const groups = remix ? [...GROUPS.slice(0, 2), { ...GROUPS[2]!, items: [...GROUPS[2]!.items, REMIX] }] : GROUPS;

  return (
    <div className="grid gap-6 lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-10 lg:transition-[grid-template-columns] lg:duration-300 in-data-[labnav=collapsed]:lg:grid-cols-[52px_minmax(0,1fr)] in-data-[labnav=collapsed]:lg:gap-8">
      {/* Lab navigation */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:h-fit">
        <div className={cn(card, "flex items-center gap-3 p-3 in-data-[labnav=collapsed]:lg:border-0 in-data-[labnav=collapsed]:lg:bg-transparent in-data-[labnav=collapsed]:lg:p-0 in-data-[labnav=collapsed]:lg:shadow-none")} title={brand.name}>
          <BrandAvatar name={brand.name} src={brand.logo} className="size-11 shrink-0 rounded-xl in-data-[labnav=collapsed]:lg:size-[52px]" />
          <div className="flex min-w-0 flex-col in-data-[labnav=collapsed]:lg:hidden">
            <span className="truncate text-[1.02rem] leading-tight font-semibold tracking-[-0.02em]">{brand.name}</span>
            <span className="truncate text-xs text-muted-foreground">{[brand.category, brand.price].filter(Boolean).join(" · ")}</span>
          </div>
          <Link href="/settings" className="ml-auto shrink-0 in-data-[labnav=collapsed]:lg:hidden rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
            Edit
          </Link>
        </div>
        <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col lg:gap-5 lg:overflow-visible" aria-label="Brand Lab">
          {groups.map((g) => (
            <div key={g.label} className="flex shrink-0 gap-1 lg:flex-col lg:gap-0.5">
              <span className="hidden px-3 pb-1 text-[0.68rem] in-data-[labnav=collapsed]:lg:invisible in-data-[labnav=collapsed]:lg:h-3 in-data-[labnav=collapsed]:lg:p-0 font-medium tracking-[0.12em] text-muted-foreground/80 uppercase lg:block">{g.label}</span>
              {g.items.map((n) => {
                const on = n.id === tab;
                const Icon = n.icon;
                const isBusy = AI_TABS[n.id] && busy[AI_TABS[n.id]!];
                return (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    title={n.label}
                    className={cn("relative flex h-9 shrink-0 items-center gap-2.5 rounded-xl px-3 in-data-[labnav=collapsed]:lg:w-[52px] in-data-[labnav=collapsed]:lg:justify-center in-data-[labnav=collapsed]:lg:px-0 text-left text-sm transition-colors", on ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground")}
                  >
                    {on && <motion.span layoutId="lab-nav" className="absolute inset-0 rounded-xl bg-secondary" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
                    <Icon className={cn("relative size-4 shrink-0", on && "text-foreground")} />
                    <span className="relative whitespace-nowrap in-data-[labnav=collapsed]:lg:sr-only">{n.label}</span>
                    {isBusy ? (
                      <Loader2 className="relative ml-auto size-3.5 animate-spin text-muted-foreground in-data-[labnav=collapsed]:lg:absolute in-data-[labnav=collapsed]:lg:top-0.5 in-data-[labnav=collapsed]:lg:right-0.5 in-data-[labnav=collapsed]:lg:size-3" />
                    ) : counts[n.id] ? (
                      <span className="relative ml-auto text-xs font-normal text-muted-foreground tabular-nums in-data-[labnav=collapsed]:lg:hidden">{counts[n.id]}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={toggleFold}
          title={folded ? "Show the menu" : "Fold the menu"}
          aria-label={folded ? "Show the Brand Lab menu" : "Fold the Brand Lab menu"}
          aria-expanded={!folded}
          className="hidden h-8 items-center gap-2 rounded-xl px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground lg:inline-flex in-data-[labnav=collapsed]:lg:w-[52px] in-data-[labnav=collapsed]:lg:justify-center in-data-[labnav=collapsed]:lg:px-0"
        >
          {folded ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          <span className="in-data-[labnav=collapsed]:lg:sr-only">Fold menu</span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-col gap-7">
        <Header current={current} section={section} entry={entry} profile={profile} busy={!!(section && busy[section])} onRegenerate={section && section !== "scripts" ? () => void run(section) : undefined} onFix={section && section !== "scripts" ? () => void run(section, { fix: true }) : undefined} />

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: EASE }}>
            {tab === "scripts" ? (
              <ScriptsView selectedId={scriptId} onSelect={selectScript} entry={entries.scripts} busySet={!!busy.scripts} error={errors.scripts} onNewSet={() => void run("scripts")} onEntry={(e) => setEntries((x) => ({ ...x, scripts: e }))} />
            ) : tab === "check" ? (
              <HumanCheck />
            ) : tab === "inspiration" ? (
              inspiration.length ? (
                <AdGrid ads={inspiration} />
              ) : (
                <div className={cn(card, "p-8 text-sm text-muted-foreground")}>
                  No competitor ads yet. Track competitors in{" "}
                  <Link href="/brands" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Brands
                  </Link>{" "}
                  and they&apos;ll show up here.
                </div>
              )
            ) : section && errors[section] && !entry ? (
              <div className={cn(card, "flex flex-col items-start gap-3 p-6")}>
                <p className="text-sm">{errors[section]}</p>
                <button onClick={() => void run(section)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background">
                  <RotateCcw className="size-3.5" /> Try again
                </button>
              </div>
            ) : !entry ? (
              <Writing />
            ) : (
              <div className={cn("transition-opacity", section && busy[section] && "pointer-events-none opacity-50")}>
                {tab === "positioning" ? (
                  <PositioningView d={entry.data as Positioning} chapter={chapter} onChapter={selectChapter} onEdit={edit("positioning")} />
                ) : tab === "branding" ? (
                  <BrandingView d={entry.data as Branding} brand={brand.name} chapter={chapter} onChapter={selectChapter} onEdit={edit("branding")} />
                ) : tab === "ideas" ? (
                  <IdeasView d={entry.data as Ideas} sources={entry.sources} chapter={chapter} onChapter={selectChapter} onEdit={edit("ideas")} />
                ) : (
                  <RemixView d={entry.data as Remix} sources={entry.sources} adId={remix?.adId ?? ""} chapter={chapter} onChapter={selectChapter} onEdit={edit("remix")} />
                )}
              </div>
            )}
            {section && section !== "scripts" && errors[section] && entry && <p className="mt-4 text-sm text-destructive">{errors[section]}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Header({
  current,
  section,
  entry,
  profile,
  busy,
  onRegenerate,
  onFix,
}: {
  current: NavEntry;
  section: LabSection | null;
  entry?: LabEntry;
  profile: string;
  busy: boolean;
  onRegenerate?: () => void;
  onFix?: () => void;
}) {
  // Scripts carry their own per-script check; strategy sections get one badge for the whole page.
  const hits = useSlop(section && section !== "scripts" ? entry?.data : null);
  return (
    <header className="flex flex-col gap-4 border-b pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <span className="text-[0.72rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">Brand Lab</span>
          <h1 className="text-[2.1rem] leading-none font-semibold tracking-[-0.03em] sm:text-[2.4rem]">{current.title}</h1>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{current.blurb}</p>
        </div>
        {onRegenerate && entry && (
          <div className="flex items-center gap-2">
            {onFix && hits.length > 0 && (
              <button onClick={onFix} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-warn-soft px-4 text-sm font-medium text-warn transition-opacity hover:opacity-80 disabled:opacity-60" title="Rewrite only the flagged lines">
                <WandSparkles className="size-3.5" /> Fix {hits.length} AI pattern{hits.length === 1 ? "" : "s"}
              </button>
            )}
          <button onClick={onRegenerate} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-secondary disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {busy ? "Rewriting…" : "Rewrite all"}
          </button>
          </div>
        )}
      </div>
      {section && section !== "scripts" && entry && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <HumanBadge hits={hits} fixed={entry.fixed} />
          <span>Written {ago(entry.createdAt)}</span>
          {entry.profile !== profile && section !== "remix" && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-warn-soft px-2.5 font-medium text-warn">
              <AlertCircle className="size-3.5" /> Your brand details changed since. Rewrite to update.
            </span>
          )}
        </div>
      )}
    </header>
  );
}
