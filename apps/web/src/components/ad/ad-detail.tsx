"use client";

import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Loader2, RotateCcw, Sparkles, Wand2, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAdPanel } from "@/components/ad/ad-panel";
import { SaveButton } from "@/components/boards/save-button";
import { BrandAvatar } from "@/components/brand-avatar";
import { TrackButton } from "@/components/brands/track-button";
import { PlatformIcons } from "@/components/feed/platform-icons";
import type { AdDetail } from "@/lib/server/ads";
import { adReason, daysText, fmtDuration } from "@/lib/format";
import { ensureAnalysis } from "@/lib/analysis-queue";
import { useUiTheme, type UiThemeId } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";
import { useVolume } from "@/lib/volume";

/*
 * The ad popup. One set of building blocks (who, actions, facts, copy, breakdown, variants), arranged
 * differently per interface style:
 *   Atria  — creative on the left, a clean info card on the right
 *   Cinema — a full-screen theater: the creative fills the stage, details in a dark side column
 *   Ledger — a drawer from the right: properties as a table, then the copy and breakdown
 *   Pop    — a bottom sheet: creative, the ad, and the breakdown side by side, no scrolling on desktop
 * The shell (position, size, animation) is chosen in ad-panel.tsx.
 */

const fmtDate = (d: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

/** "https://www.shop.com/x" -> "shop.com" (null if it isn't a URL). */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ data

function useAdInfo(ad: AdDetail) {
  const panel = useAdPanel();
  // Older, long-form breakdowns (version 1) are upgraded to the short format on open.
  const fresh = ad.analysis && (ad.analysis.version ?? 1) >= 2 ? ad.analysis : null;
  const [state, setState] = useState<"idle" | "running" | "error">(() => (fresh ? "idle" : "running"));
  const [aiError, setAiError] = useState<string | null>(null);

  const request = async () => {
    // Shared with hover-prefetch: if a tile already started it, this waits for that result.
    const r = await ensureAnalysis(ad.id);
    if (r.ok) {
      await panel.reload(ad.id);
      setState("idle");
    } else {
      setAiError(r.error);
      setState("error");
    }
  };
  const rerun = () => {
    setState("running");
    setAiError(null);
    void request();
  };
  // Break the ad down the moment it opens (free tier; shared across duplicates).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state only changes after the network call resolves
    if (!fresh) void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.id]);

  // Where "Shop now" goes: the ad's landing page, else a variant's, else the brand's own website.
  const variantUrl = ad.variant_list.find((v) => v.landing_url)?.landing_url ?? null;
  const destination = ad.landing_url
    ? { url: ad.landing_url, label: ad.cta || "Shop now", domain: ad.landing_domain }
    : variantUrl
      ? { url: variantUrl, label: ad.cta || "Shop now", domain: hostOf(variantUrl) }
      : ad.brand_website
        ? { url: `https://${ad.brand_website.replace(/^https?:\/\//, "")}`, label: "Visit site", domain: ad.brand_website.replace(/^https?:\/\/(www\.)?/, "") }
        : null;
  const libraryUrl = /^\d+$/.test(ad.source_ad_id)
    ? ad.brand_platform === "tiktok"
      ? `https://library.tiktok.com/ads/detail/?ad_id=${ad.source_ad_id}`
      : `https://www.facebook.com/ads/library/?id=${ad.source_ad_id}`
    : null;

  return {
    panel,
    a: fresh,
    state,
    aiError,
    rerun,
    destination,
    libraryUrl,
    reason: adReason(ad),
    versions: Math.max(ad.variant_list.length + 1, ad.variations_count),
    whyList: (fresh?.why_it_works ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 3),
    format: ad.format === "dco" ? "Dynamic" : ad.format.charAt(0).toUpperCase() + ad.format.slice(1),
  };
}
type Info = ReturnType<typeof useAdInfo>;

// ------------------------------------------------------------------ the creative

function Stage({ ad, videoRef, className, mediaClass }: { ad: AdDetail; videoRef: React.RefObject<HTMLVideoElement | null>; className?: string; mediaClass?: string }) {
  const items = ad.media.length ? ad.media : ad.thumbnail_url ? [{ type: "image" as const, url: ad.thumbnail_url }] : [];
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const volume = useVolume();
  const cur = items[i];

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume || 0;
    v.muted = volume === 0;
    // Opening the popup was a click, so sound is allowed.
    void v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => undefined);
    });
  }, [volume, cur?.url, videoRef]);

  if (!cur)
    return (
      <div className={cn("grid place-items-center p-10 text-center", className)}>
        <p className="font-display max-w-md text-2xl leading-tight font-semibold">{ad.headline ?? ad.body_text ?? "Text ad"}</p>
      </div>
    );
  const media = cn("max-h-full max-w-full object-contain", mediaClass);
  return (
    <div data-popup-keep className={cn("relative flex items-center justify-center", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={cur.url} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex size-full items-center justify-center">
          {cur.type === "video" ? (
            <video ref={videoRef} src={cur.url} poster={cur.previewUrl ?? ad.thumbnail_url ?? undefined} controls loop playsInline className={media} />
          ) : failed[i] ? (
            <p className="p-6 text-center text-sm text-muted-foreground">This image link expired. It refreshes on the next brand sync.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.url} alt="" referrerPolicy="no-referrer" onError={() => setFailed((f) => ({ ...f, [i]: true }))} className={media} />
          )}
        </motion.div>
      </AnimatePresence>
      {items.length > 1 && (
        <>
          {[-1, 1].map((d) => (
            <button
              key={d}
              onClick={() => setI((i + d + items.length) % items.length)}
              className={cn("absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-lg", d < 0 ? "left-3" : "right-3")}
              aria-label={d < 0 ? "Previous image" : "Next image"}
            >
              {d < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
            </button>
          ))}
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white tabular-nums">
            {i + 1} / {items.length}
          </span>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ blocks

const LABEL: Record<UiThemeId, string> = {
  atria: "text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase",
  cinema: "text-[0.7rem] font-bold tracking-[0.2em] text-pink uppercase",
  ledger: "text-xs font-semibold text-muted-foreground",
  pop: "w-fit rounded-full bg-foreground px-2.5 py-0.5 text-[0.7rem] font-black tracking-wide text-background uppercase",
};

function BrandLine({ ad, info, look, big }: { ad: AdDetail; info: Info; look: UiThemeId; big?: boolean }) {
  const name = ad.brand_id ? (
    <Link href={`/brands/${ad.brand_id}`} onClick={info.panel.close} className="truncate hover:underline">
      {ad.brand_name}
    </Link>
  ) : (
    <span className="truncate">{ad.brand_name ?? "Unknown brand"}</span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandAvatar name={ad.brand_name} src={ad.brand_logo} fallbackSrc={ad.brand_logo_small} className={cn(big ? "size-12" : "size-10", look === "pop" && "border-2 border-foreground", look === "ledger" && "rounded-md")} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("flex min-w-0 font-semibold", big ? "font-display text-2xl leading-tight tracking-[-0.02em]" : "text-base", look === "pop" && "font-extrabold uppercase")}>{name}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1 font-medium", ad.is_active ? "text-ok" : "")}>
            <span className={cn("size-1.5 rounded-full", ad.is_active ? "bg-ok" : "bg-muted-foreground")} />
            {ad.is_active ? "Active" : "Stopped"}
          </span>
          <span>{daysText(ad.days_running) ?? "New"}</span>
          {info.versions > 1 && <span>{info.versions} versions</span>}
          {info.reason && (
            <span title={info.reason.why} className="font-semibold text-pink-ink">
              {info.reason.label}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

const BTN: Record<UiThemeId, { main: string; side: string; icon: string }> = {
  atria: {
    main: "h-11 rounded-full bg-pink px-5 font-semibold text-[#0a0a0b] hover:shadow-[var(--glow-pink)]",
    side: "h-11 rounded-full bg-ink px-4 font-medium text-ink-foreground",
    icon: "size-11 rounded-full border bg-card hover:border-foreground/30",
  },
  cinema: {
    main: "h-12 rounded-full bg-pink px-6 font-bold text-black hover:shadow-[var(--glow-pink)]",
    side: "h-12 rounded-full bg-white/10 px-5 font-semibold text-white hover:bg-white/15",
    icon: "size-12 rounded-full bg-white/10 text-white hover:bg-white/15",
  },
  ledger: {
    main: "h-9 rounded-md bg-pink px-4 font-medium text-white dark:text-black",
    side: "h-9 rounded-md border px-3 font-medium hover:bg-secondary",
    icon: "size-9 rounded-md border hover:bg-secondary",
  },
  pop: {
    main: "h-11 rounded-2xl border-2 border-foreground bg-pink px-5 font-black text-black uppercase shadow-[3px_3px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
    side: "h-11 rounded-2xl border-2 border-foreground bg-lime px-4 font-black text-lime-ink uppercase shadow-[3px_3px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
    icon: "size-11 rounded-2xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--foreground)]",
  },
};

function Actions({ ad, info, look }: { ad: AdDetail; info: Info; look: UiThemeId }) {
  const b = BTN[look];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {info.destination && (
        <a href={info.destination.url} target="_blank" rel="noreferrer noopener" title={info.destination.domain ?? undefined} className={cn("group/shop inline-flex min-w-0 flex-1 items-center justify-center gap-2 text-sm transition-shadow", b.main)}>
          <span className="truncate">{info.destination.label}</span>
          <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover/shop:rotate-45" />
        </a>
      )}
      <SaveButton adId={ad.id} align="right" />
      <Link href={`/lab/remix/${ad.id}`} onClick={info.panel.close} title="Adapt this ad for your brand" className={cn("inline-flex items-center gap-1.5 text-sm", b.side)}>
        <Wand2 className="size-4" /> Remix
      </Link>
      {info.libraryUrl && (
        <a href={info.libraryUrl} target="_blank" rel="noreferrer noopener" title={`Open in the ${ad.brand_platform === "tiktok" ? "TikTok" : "Meta"} Ad Library`} aria-label="Open in the Ad Library" className={cn("grid shrink-0 place-items-center", b.icon)}>
          <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}

function CloseButton({ info, look }: { info: Info; look: UiThemeId }) {
  return (
    <button
      onClick={info.panel.close}
      aria-label="Close"
      title="Close (Esc)"
      className={cn(
        "grid shrink-0 place-items-center transition-[background-color,color,transform]",
        look === "atria" && "size-9 rounded-full bg-secondary text-muted-foreground hover:rotate-90 hover:bg-ink hover:text-ink-foreground",
        look === "cinema" && "size-11 rounded-full bg-white/10 text-white hover:bg-white/20",
        look === "ledger" && "size-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground",
        look === "pop" && "size-10 rounded-2xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--foreground)] hover:bg-pink",
      )}
    >
      <X className="size-4" />
    </button>
  );
}

/** Started, running time, format, platforms, countries: as cells, property rows or chips. */
function Facts({ ad, info, look }: { ad: AdDetail; info: Info; look: UiThemeId }) {
  const rows: [string, React.ReactNode][] = [
    ["Started", fmtDate(ad.start_date)],
    ["Running", ad.end_date ? `Stopped ${fmtDate(ad.end_date)}` : (daysText(ad.days_running) ?? "New")],
    ["Format", info.format],
    ["Where", <PlatformIcons key="p" platforms={ad.platforms} />],
    ["Countries", ad.countries.slice(0, 8).join(" ") || "Not disclosed"],
  ];
  if (look === "ledger")
    return (
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="border-b py-2 text-muted-foreground">{k}</dt>
            <dd className="border-b py-2 font-medium">{v}</dd>
          </div>
        ))}
        <dt className="py-2 text-muted-foreground">Library ID</dt>
        <dd className="truncate py-2 font-mono text-xs leading-5">{ad.source_ad_id}</dd>
      </dl>
    );
  if (look === "pop")
    return (
      <div className="flex flex-wrap gap-2">
        {rows.map(([k, v], i) => (
          <span key={k} className={cn("inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground px-2.5 py-1 text-xs font-bold", i % 2 ? "bg-card" : "bg-secondary")}>
            <span className="opacity-60">{k}</span> {v}
          </span>
        ))}
      </div>
    );
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4", look === "atria" ? "rounded-2xl border bg-border" : "rounded-xl bg-white/10")}>
      {rows.slice(0, 4).map(([k, v]) => (
        <div key={k} className={cn("flex flex-col gap-0.5 px-3.5 py-2.5", look === "atria" ? "bg-background" : "bg-[#101012]")}>
          <dt className="text-[0.68rem] text-muted-foreground">{k}</dt>
          <dd className="text-sm font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The ad's own words, shown right away (long text folds), with a copy button. */
function CopyText({ ad, look }: { ad: AdDetail; look: UiThemeId }) {
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = ad.body_text ?? "";
  const long = body.length > 280 || body.split("\n").length > 5;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className={LABEL[look]}>What the ad says</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText([ad.headline, ad.body_text].filter(Boolean).join("\n\n"));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success("Copied the ad text");
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} Copy
        </button>
      </div>
      {ad.headline && <p className={cn("leading-snug font-semibold", look === "cinema" ? "text-xl" : "text-[1.02rem]")}>{ad.headline}</p>}
      {body ? <p className={cn("text-[0.92rem] leading-relaxed whitespace-pre-line text-muted-foreground", !more && long && "line-clamp-4")}>{body}</p> : !ad.headline && <p className="text-sm text-muted-foreground">No text on this ad.</p>}
      {long && (
        <button onClick={() => setMore(!more)} className="w-fit text-xs font-semibold underline underline-offset-2">
          {more ? "Show less" : "Show all"}
        </button>
      )}
      {ad.description && <p className="text-xs text-muted-foreground">{ad.description}</p>}
    </section>
  );
}

const STEPS = ["Watching the creative", "Finding the hook", "Why it works", "What to steal"];

function Analyzing({ video }: { video: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Loader2 className="size-4 animate-spin text-pink-ink dark:text-pink" /> Breaking this ad down… <span className="font-normal text-muted-foreground">{video ? "watching the video" : "reading the creative"}</span>
      </span>
      <ol className="flex flex-col gap-1.5">
        {STEPS.map((s, k) => (
          <li key={s} className={cn("flex items-center gap-2 text-sm transition-opacity duration-500", k > step && "opacity-35")}>
            {k < step ? <Check className="size-4 text-ok" /> : k === step ? <Loader2 className="size-4 animate-spin" /> : <span className="size-4 rounded-full border" />}
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The AI breakdown: hook, why it works, what to steal, key beats. */
function Breakdown({ ad, info, look, seek }: { ad: AdDetail; info: Info; look: UiThemeId; seek: (s: number) => void }) {
  const { a } = info;
  if (info.state === "running" && !a) return <Analyzing video={ad.format === "video" || !!ad.video_url} />;
  if (!a)
    return (
      <div className="flex items-center gap-3 rounded-xl border p-4 text-sm">
        <Sparkles className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-muted-foreground">{info.aiError ?? "The AI breakdown isn't ready yet."}</span>
        <button onClick={info.rerun} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground">
          Try again
        </button>
      </div>
    );
  const steal =
    look === "atria"
      ? "rounded-2xl bg-ink p-4 text-ink-foreground"
      : look === "cinema"
        ? "rounded-xl border border-pink/40 bg-pink/10 p-4"
        : look === "ledger"
          ? "rounded-md border-l-[3px] border-pink bg-pink-soft p-3"
          : "rounded-2xl border-2 border-foreground bg-lime p-4 text-lime-ink shadow-[3px_3px_0_0_var(--foreground)]";
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <span className={cn("flex items-center gap-2", LABEL[look])}>
          <Zap className="size-3.5" /> The hook · {a.hook_type}
        </span>
        <p className={cn("leading-[1.2] font-semibold tracking-[-0.02em]", look === "ledger" ? "text-lg" : "font-display text-[1.45rem]", look === "pop" && "font-extrabold")}>&ldquo;{a.hook_text}&rdquo;</p>
        <p className="text-[0.92rem] leading-relaxed text-muted-foreground">{a.angle}</p>
      </section>

      {a.takeaway && (
        <section className={steal}>
          <span className="mb-1 block text-[0.7rem] font-bold tracking-[0.1em] uppercase opacity-80">Steal this</span>
          <p className="text-[0.95rem] leading-snug">{a.takeaway}</p>
        </section>
      )}

      {info.whyList.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <span className={LABEL[look]}>Why it works</span>
          <ol className="flex flex-col gap-2.5">
            {info.whyList.map((w, k) => (
              <li key={k} className="flex gap-3 text-[0.93rem] leading-snug">
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center text-[0.66rem] font-bold", look === "pop" ? "rounded-md border-2 border-foreground" : look === "ledger" ? "rounded bg-secondary" : "rounded-full bg-foreground text-background")}>{k + 1}</span>
                {w}
              </li>
            ))}
          </ol>
        </section>
      )}

      {a.script_breakdown && a.script_breakdown.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className={LABEL[look]}>Key beats {ad.video_url && <span className="font-normal normal-case opacity-70">· click to jump</span>}</span>
          <ol className="flex flex-col">
            {a.script_breakdown.map((s, k) => (
              <li key={k}>
                <button onClick={() => seek(s.start_s)} disabled={!ad.video_url} className="flex w-full items-start gap-3 rounded-lg px-1.5 py-1.5 text-left enabled:hover:bg-secondary">
                  <span className="mt-px shrink-0 rounded bg-secondary px-1.5 font-mono text-[0.7rem] leading-5 tabular-nums">{fmtDuration(s.start_s)}</span>
                  <span className="flex min-w-0 flex-col text-[0.9rem] leading-snug">
                    <span>{s.visual}</span>
                    {(s.voiceover || s.on_screen_text) && <span className="text-[0.82rem] text-muted-foreground">{s.voiceover ? `“${s.voiceover}”` : s.on_screen_text}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="flex flex-wrap items-center gap-1.5 text-xs">
        {a.target_audience && <span className="rounded-full bg-secondary px-2.5 py-1">{a.target_audience}</span>}
        {a.offer && <span className="rounded-full bg-lime px-2.5 py-1 text-lime-ink">{a.offer}</span>}
        <button onClick={info.rerun} disabled={info.state === "running"} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          {info.state === "running" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Redo
        </button>
      </footer>
    </div>
  );
}

function Variants({ ad, look }: { ad: AdDetail; look: UiThemeId }) {
  const [all, setAll] = useState(false);
  if (!ad.variant_list.length) return null;
  const list = all ? ad.variant_list : ad.variant_list.slice(0, 3);
  return (
    <section className="flex flex-col gap-2">
      <span className={LABEL[look]}>Other versions · {ad.variant_list.length}</span>
      <ul className={cn("flex flex-col divide-y overflow-hidden", look === "pop" ? "rounded-2xl border-2 border-foreground" : "rounded-xl border")}>
        {list.map((v) => (
          <li key={v.id} className="flex flex-col gap-0.5 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", v.is_active ? "bg-ok" : "bg-muted-foreground")} />
              since {fmtDate(v.start_date)}
              {v.countries.length > 0 && <span className="truncate">· {v.countries.slice(0, 6).join(" ")}</span>}
              {v.landing_url && (
                <a href={v.landing_url} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground hover:underline">
                  {v.cta ?? "Open"} <ArrowUpRight className="size-3" />
                </a>
              )}
            </div>
            {v.headline && <p className="text-sm font-semibold">{v.headline}</p>}
            {v.body_text && <p className="line-clamp-2 text-sm text-muted-foreground">{v.body_text}</p>}
          </li>
        ))}
      </ul>
      {ad.variant_list.length > 3 && (
        <button onClick={() => setAll(!all)} className="w-fit text-xs font-semibold underline underline-offset-2">
          {all ? "Show fewer" : `Show all ${ad.variant_list.length}`}
        </button>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ layouts

export function AdDetailView({ ad }: { ad: AdDetail }) {
  const [ui] = useUiTheme();
  const info = useAdInfo(ad);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seek = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = s;
    void v.play();
  };
  const track = ad.brand_id ? <TrackButton brandId={ad.brand_id} status={(ad.brand_status as "tracked" | "discovered" | "ignored") ?? "discovered"} size="sm" /> : null;

  if (ui === "cinema")
    return (
      <div className="flex h-full flex-col bg-black text-white lg:flex-row">
        <Stage ad={ad} videoRef={videoRef} className="min-h-[55vh] flex-1 p-4 lg:h-full lg:p-10" mediaClass="rounded-xl" />
        <aside data-popup-keep className="flex w-full flex-col border-white/10 bg-[#0d0d0f] lg:h-full lg:w-[460px] lg:border-l">
          <header className="flex flex-col gap-5 p-6 pb-5">
            <div className="flex items-start justify-between gap-3">
              <BrandLine ad={ad} info={info} look="cinema" big />
              <CloseButton info={info} look="cinema" />
            </div>
            <Actions ad={ad} info={info} look="cinema" />
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pb-8">
            <Facts ad={ad} info={info} look="cinema" />
            <CopyText ad={ad} look="cinema" />
            <Breakdown ad={ad} info={info} look="cinema" seek={seek} />
            <Variants ad={ad} look="cinema" />
            {track}
          </div>
        </aside>
      </div>
    );

  if (ui === "ledger")
    return (
      <div data-popup-keep className="flex h-full flex-col border-l bg-background">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <BrandLine ad={ad} info={info} look="ledger" />
          <span className="ml-auto flex items-center gap-2">
            {track}
            <CloseButton info={info} look="ledger" />
          </span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <Stage ad={ad} videoRef={videoRef} className="h-[360px]" mediaClass="rounded-md" />
            <div className="flex flex-col gap-4">
              <Facts ad={ad} info={info} look="ledger" />
              <Actions ad={ad} info={info} look="ledger" />
            </div>
          </div>
          <CopyText ad={ad} look="ledger" />
          <div className="border-t pt-5">
            <Breakdown ad={ad} info={info} look="ledger" seek={seek} />
          </div>
          <Variants ad={ad} look="ledger" />
        </div>
      </div>
    );

  if (ui === "pop")
    return (
      <div data-popup-keep className="flex h-full flex-col rounded-t-[2rem] border-2 border-b-0 border-foreground bg-background">
        <span className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-foreground/30" />
        <header className="flex flex-wrap items-center gap-4 border-b-2 border-foreground px-6 pt-3 pb-4">
          <BrandLine ad={ad} info={info} look="pop" big />
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {track}
            <CloseButton info={info} look="pop" />
          </span>
        </header>
        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.1fr)] lg:overflow-hidden">
          <Stage ad={ad} videoRef={videoRef} className="min-h-[50vh] p-5 lg:h-full lg:min-h-0" mediaClass="rounded-2xl border-2 border-foreground" />
          <div className="flex flex-col gap-5 border-foreground p-6 lg:min-h-0 lg:overflow-y-auto lg:border-x-2">
            <Actions ad={ad} info={info} look="pop" />
            <Facts ad={ad} info={info} look="pop" />
            <CopyText ad={ad} look="pop" />
            <Variants ad={ad} look="pop" />
          </div>
          <div className="p-6 lg:min-h-0 lg:overflow-y-auto">
            <Breakdown ad={ad} info={info} look="pop" seek={seek} />
          </div>
        </div>
      </div>
    );

  // Atria
  return (
    <div className="flex h-full flex-col items-center gap-5 @4xl:flex-row @4xl:items-stretch @4xl:justify-center">
      <Stage ad={ad} videoRef={videoRef} className="h-[68vh] w-full @4xl:h-full @4xl:w-auto @4xl:max-w-[56%] @4xl:flex-1" mediaClass="rounded-[22px] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]" />
      <div data-popup-keep className="flex w-full min-w-0 flex-col overflow-hidden rounded-[30px] border bg-background shadow-[0_30px_90px_-30px_rgb(0_0_0/0.6)] @4xl:h-full @4xl:min-h-0 @4xl:max-w-[600px] @4xl:min-w-[460px] @4xl:flex-1">
        <header className="flex flex-col gap-4 border-b px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-3">
            <BrandLine ad={ad} info={info} look="atria" big />
            <span className="flex shrink-0 items-center gap-2">
              {track}
              <CloseButton info={info} look="atria" />
            </span>
          </div>
          <Actions ad={ad} info={info} look="atria" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pt-5 pb-8">
          <Facts ad={ad} info={info} look="atria" />
          <CopyText ad={ad} look="atria" />
          <Breakdown ad={ad} info={info} look="atria" seek={seek} />
          <Variants ad={ad} look="atria" />
        </div>
      </div>
    </div>
  );
}
