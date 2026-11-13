"use client";

import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Loader2, RotateCcw, Sparkles, Target, Wand2, X, Zap } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useVolume } from "@/lib/volume";

const fmtDate = (d: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);


/** Media stage: the creative at full size on black, in its real shape. Video plays with the app-wide volume. */
function Stage({ ad, videoRef }: { ad: AdDetail; videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const items = ad.media.length ? ad.media : ad.thumbnail_url ? [{ type: "image" as const, url: ad.thumbnail_url }] : [];
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  // The creative's real width/height, so the frame is sized from it (never squeezed before the video loads).
  const [ratio, setRatio] = useState<number>(ad.format === "video" || ad.video_url ? 9 / 16 : 4 / 5);
  const volume = useVolume();
  const cur = items[i];
  const fit = (w: number, h: number) => w && h && setRatio(Math.min(2, Math.max(0.5, w / h)));

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
      <div className="wash-pink grid h-full min-h-[45vh] place-items-center p-10 text-center">
        <p className="font-display max-w-md text-2xl leading-tight font-semibold tracking-[-0.03em]">{ad.headline ?? ad.body_text ?? "Text ad"}</p>
      </div>
    );
  return (
    <div data-popup-keep className="relative h-full max-h-full max-w-full" style={{ aspectRatio: ratio }}>
      <AnimatePresence mode="wait">
        <motion.div key={cur.url} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0">
          {cur.type === "video" ? (
            <video
              ref={videoRef}
              src={cur.url}
              poster={cur.previewUrl ?? ad.thumbnail_url ?? undefined}
              controls
              loop
              playsInline
              onLoadedMetadata={(e) => fit(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
              className="size-full rounded-[22px] bg-black object-contain shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]"
            />
          ) : failed[i] ? (
            <p className="grid size-full place-items-center rounded-[22px] bg-background/90 p-6 text-center text-sm text-muted-foreground">This image link expired. It refreshes on the next brand sync.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cur.url}
              alt=""
              referrerPolicy="no-referrer"
              onLoad={(e) => i === 0 && fit(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
              onError={() => setFailed((f) => ({ ...f, [i]: true }))}
              className="size-full rounded-[22px] object-contain shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]"
            />
          )}
        </motion.div>
      </AnimatePresence>
      {items.length > 1 && (
        <>
          {[-1, 1].map((d) => (
            <button
              key={d}
              onClick={() => setI((i + d + items.length) % items.length)}
              className={cn("absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-lg transition-transform hover:scale-105", d < 0 ? "left-4" : "right-4")}
              aria-label={d < 0 ? "Previous image" : "Next image"}
            >
              {d < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
            </button>
          ))}
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
            {items.map((_, k) => (
              <button key={k} onClick={() => setI(k)} aria-label={`Image ${k + 1}`} className={cn("h-1.5 rounded-full bg-white/50 transition-all duration-300", k === i ? "w-6 bg-white" : "w-1.5")} />
            ))}
          </div>
        </>
      )}
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="relative grid size-10 place-items-center rounded-full bg-ink text-pink">
          <Sparkles className="size-4" />
          <span className="absolute inset-0 animate-ping rounded-full bg-pink/30" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Breaking this ad down…</span>
          <span className="text-xs text-muted-foreground">{video ? "Watching the video" : "Reading the creative"} · free AI</span>
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {STEPS.map((s, k) => (
          <li key={s} className={cn("flex items-center gap-2 text-sm transition-opacity duration-500", k > step && "opacity-35")}>
            {k < step ? <Check className="size-4 text-ok" /> : k === step ? <Loader2 className="size-4 animate-spin text-pink-ink dark:text-pink" /> : <span className="size-4 rounded-full border" />}
            {s}
          </li>
        ))}
      </ol>
      <div className="skeleton-shimmer h-24 rounded-2xl" />
      <div className="skeleton-shimmer h-16 rounded-2xl" />
    </div>
  );
}

type Tab = "breakdown" | "copy" | "variants" | "details";

export function AdDetailView({ ad }: { ad: AdDetail }) {
  const panel = useAdPanel();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Older, long-form breakdowns (version 1) are upgraded to the short format on open.
  const fresh = ad.analysis && (ad.analysis.version ?? 1) >= 2 ? ad.analysis : null;
  const [state, setState] = useState<"idle" | "running" | "error">(() => (fresh ? "idle" : "running"));
  const [aiError, setAiError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("breakdown");
  const [copied, setCopied] = useState(false);
  const a = fresh;
  const whyList = (a?.why_it_works ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
  const libraryUrl = `https://www.facebook.com/ads/library/?id=${ad.source_ad_id}`;
  const reason = adReason(ad);
  const versions = Math.max(ad.variant_list.length + 1, ad.variations_count);

  const request = async () => {
    // Shared with hover-prefetch: if the tile already started it, this just waits for that result.
    const r = await ensureAnalysis(ad.id);
    if (r.ok) {
      await panel.reload(ad.id);
      setState("idle");
    } else {
      setAiError(r.error);
      setState("error");
    }
  };
  const runAnalysis = () => {
    setState("running");
    setAiError(null);
    void request();
  };

  // Break the ad down automatically the moment it opens (free tier; shared across duplicates).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state only changes after the network call resolves
    if (!fresh) void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.id]);

  const seek = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = s;
    void v.play();
  };

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "breakdown", label: "Breakdown" },
    { id: "copy", label: "Copy" },
    ...(ad.variant_list.length ? [{ id: "variants" as Tab, label: "Variants", n: ad.variant_list.length + 1 }] : []),
    { id: "details", label: "Details" },
  ];

  return (
    <div className="flex h-full flex-col items-center gap-6 @4xl:flex-row @4xl:items-stretch @4xl:justify-center">
      <div className="flex h-[70vh] max-w-full shrink-0 items-center justify-center @4xl:h-full @4xl:max-w-[58%]">
        <Stage ad={ad} videoRef={videoRef} />
      </div>

      <div data-popup-keep className="@container/info flex w-full min-w-0 flex-col overflow-hidden rounded-[32px] border bg-background shadow-[0_30px_90px_-30px_rgb(0_0_0/0.6)] @4xl:h-full @4xl:min-h-0 @4xl:min-w-[500px] @4xl:max-w-[720px] @4xl:flex-1">
        {/* Header: who, how it's doing, what you can do */}
        <header className="flex flex-col gap-5 border-b px-7 pt-7 pb-5">
          <div className="flex items-start gap-3.5">
            <BrandAvatar name={ad.brand_name} src={ad.brand_logo} fallbackSrc={ad.brand_logo_small} className="size-14 ring-4 ring-secondary" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {ad.brand_id ? (
                <Link href={`/brands/${ad.brand_id}`} onClick={panel.close} className="w-fit truncate font-display text-2xl leading-tight font-semibold tracking-[-0.03em] hover:underline">
                  {ad.brand_name}
                </Link>
              ) : (
                <span className="font-display text-2xl leading-tight font-semibold tracking-[-0.03em]">{ad.brand_name ?? "Unknown brand"}</span>
              )}
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium", ad.is_active ? "bg-ok-soft text-ok" : "bg-secondary text-muted-foreground")}>
                  <span className={cn("size-1.5 rounded-full", ad.is_active ? "bg-ok" : "bg-muted-foreground")} />
                  {ad.is_active ? "Active" : "Stopped"}
                </span>
                <span className="rounded-full bg-secondary px-2.5 py-1">{daysText(ad.days_running) ?? "—"}</span>
                {versions > 1 && <span className="rounded-full bg-secondary px-2.5 py-1">{versions} versions</span>}
                {ad.brand_likes ? <span className="rounded-full bg-secondary px-2.5 py-1">{compact(ad.brand_likes)} followers</span> : null}
                {reason && (
                  <span title={reason.why} className="rounded-full bg-pink-soft px-2.5 py-1 font-semibold text-pink-ink">
                    {reason.label}
                  </span>
                )}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {ad.brand_id && <TrackButton brandId={ad.brand_id} status={(ad.brand_status as "tracked" | "discovered" | "ignored") ?? "discovered"} size="sm" />}
              <button onClick={panel.close} aria-label="Close" title="Close (Esc)" className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground transition-[background-color,color,transform] hover:rotate-90 hover:bg-ink hover:text-ink-foreground">
                <X className="size-4" />
              </button>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {ad.landing_url ? (
              <a
                href={ad.landing_url}
                target="_blank"
                rel="noreferrer noopener"
                title={ad.landing_domain ?? undefined}
                className="group/shop inline-flex h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-full bg-pink pr-1.5 pl-5 text-sm font-semibold text-[#0a0a0b] transition-shadow duration-300 hover:shadow-[var(--glow-pink)]"
              >
                <span className="truncate">
                  Shop now{ad.landing_domain ? <span className="ml-1.5 font-normal opacity-70">{ad.landing_domain}</span> : null}
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white">
                  <ArrowUpRight className="size-4 transition-transform duration-300 group-hover/shop:rotate-45" />
                </span>
              </a>
            ) : (
              <span className="flex-1" />
            )}
            <SaveButton adId={ad.id} align="right" />
            <Link
              href={`/lab/remix/${ad.id}`}
              onClick={panel.close}
              title="Adapt this ad for your brand in AI Studio"
              className="inline-flex h-12 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-medium text-ink-foreground transition-transform active:scale-95"
            >
              <Wand2 className="size-4 text-pink" /> Remix
            </Link>
            <a href={libraryUrl} target="_blank" rel="noreferrer" title="Open in Meta Ad Library" className="grid size-12 shrink-0 place-items-center rounded-full border bg-card transition-colors hover:border-foreground/25">
              <ExternalLink className="size-4" />
            </a>
          </div>
        </header>

        {/* Tabs */}
        <nav className="mx-7 mt-5 flex gap-1 rounded-full bg-secondary p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("relative flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {tab === t.id && <motion.span layoutId={`ad-tab-${ad.id}`} className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
              <span className="relative">
                {t.label}
                {t.n ? <span className="ml-1.5 font-mono text-[0.62rem] text-muted-foreground">{t.n}</span> : null}
              </span>
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-6 pb-8">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {tab === "breakdown" &&
                (state === "running" && !a ? (
                  <Analyzing video={ad.format === "video" || !!ad.video_url} />
                ) : a ? (
                  <div className="flex flex-col gap-8">
                    {/* The hook */}
                    <section className="flex flex-col gap-3">
                      <span className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                        <Zap className="size-3.5 text-pink-ink dark:text-pink" /> The hook
                        <span className="rounded-full bg-pink-soft px-2 py-0.5 text-[0.62rem] tracking-normal text-pink-ink normal-case">{a.hook_type}</span>
                      </span>
                      <p className="font-display text-[1.65rem] leading-[1.18] font-semibold tracking-[-0.03em]">&ldquo;{a.hook_text}&rdquo;</p>
                      <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{a.angle}</p>
                    </section>

                    {whyList.length > 0 && (
                      <section className="flex flex-col gap-3">
                        <span className="text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Why it works</span>
                        <ol className="flex flex-col gap-3">
                          {whyList.map((w, k) => (
                            <motion.li key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.07 * k }} className="flex gap-3 text-[0.95rem] leading-snug">
                              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[0.66rem] text-ink-foreground">{k + 1}</span>
                              {w}
                            </motion.li>
                          ))}
                        </ol>
                      </section>
                    )}

                    {a.takeaway && (
                      <section className="flex items-start gap-4 rounded-3xl bg-ink p-5 text-ink-foreground">
                        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pink text-[#0a0a0b]">
                          <Sparkles className="size-5" />
                        </span>
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.7rem] font-semibold tracking-[0.08em] text-pink uppercase">Steal this</span>
                          <p className="text-[0.95rem] leading-snug">{a.takeaway}</p>
                        </div>
                      </section>
                    )}

                    {a.script_breakdown && a.script_breakdown.length > 0 && (
                      <section className="flex flex-col gap-3">
                        <span className="text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Key beats</span>
                        <ol className="relative flex flex-col gap-1 border-l pl-5">
                          {a.script_breakdown.map((s, k) => (
                            <li key={k} className="relative">
                              <span className="absolute top-3.5 -left-[26px] size-2.5 rounded-full border-2 border-background bg-foreground/40" />
                              <button
                                onClick={() => seek(s.start_s)}
                                disabled={!ad.video_url}
                                className="group/beat flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition-colors enabled:hover:bg-surface"
                              >
                                <span className="mt-px h-6 shrink-0 rounded-lg bg-secondary px-2 font-mono text-[0.7rem] leading-6 tabular-nums group-enabled/beat:group-hover/beat:bg-pink group-enabled/beat:group-hover/beat:text-[#0a0a0b]">
                                  {fmtDuration(s.start_s)}
                                </span>
                                <span className="flex min-w-0 flex-col gap-0.5 text-[0.95rem] leading-snug">
                                  <span>{s.visual}</span>
                                  {(s.voiceover || s.on_screen_text) && <span className="text-sm text-muted-foreground">{s.voiceover ? `“${s.voiceover}”` : s.on_screen_text}</span>}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}

                    <footer className="flex flex-col gap-3 border-t pt-5">
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {a.target_audience && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                            <Target className="size-3" /> {a.target_audience}
                          </span>
                        )}
                        {a.offer && <span className="rounded-full bg-lime px-2.5 py-1 text-lime-ink">{a.offer}</span>}
                        {a.format_tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        {a.model && <span className="font-mono text-[0.62rem] text-muted-foreground/70">{a.model} · free</span>}
                        <button onClick={runAnalysis} disabled={state === "running"} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          {state === "running" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Redo
                        </button>
                      </div>
                    </footer>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border p-4 text-sm">
                    <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-muted-foreground">{aiError ?? "The AI breakdown isn't ready yet."}</span>
                    <button onClick={runAnalysis} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground">
                      Try again
                    </button>
                  </div>
                ))}

              {tab === "copy" && (
                <div className="flex flex-col gap-4">
                  {ad.headline && <p className="font-display text-xl leading-snug font-semibold tracking-[-0.02em]">{ad.headline}</p>}
                  {ad.body_text ? <p className="text-[0.94rem] leading-relaxed whitespace-pre-line text-muted-foreground">{ad.body_text}</p> : <p className="text-sm text-muted-foreground">This ad has no primary text.</p>}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {ad.cta && <span className="rounded-full bg-ink px-3 py-1.5 font-medium text-ink-foreground">{ad.cta}</span>}
                    {ad.description && <span className="rounded-full border px-3 py-1.5 text-muted-foreground">{ad.description}</span>}
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText([ad.headline, ad.body_text].filter(Boolean).join("\n\n"));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                        toast.success("Copy copied");
                      }}
                      className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium transition-colors hover:bg-secondary"
                    >
                      {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} Copy text
                    </button>
                  </div>
                </div>
              )}

              {tab === "variants" && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">Same creative, different copy, products or countries. Shown once in your feed.</p>
                  <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border">
                    {ad.variant_list.map((v) => (
                      <li key={v.id} className="flex flex-col gap-1 px-4 py-3">
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
                </div>
              )}

              {tab === "details" && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  {(
                    [
                      ["Started", fmtDate(ad.start_date)],
                      ["Stopped", ad.end_date ? fmtDate(ad.end_date) : ad.is_active ? "Still running" : "—"],
                      ["Format", ad.format === "dco" ? "Dynamic (catalog)" : ad.format],
                      ["Category", ad.brand_category ?? "—"],
                      ["Countries", ad.countries.join(" ") || "All / not disclosed"],
                      ["First seen by Atria", fmtDate(ad.first_seen_at)],
                      ["Landing page", ad.landing_url ?? "—"],
                      ["Ad Library ID", ad.source_ad_id],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className={cn("flex flex-col gap-0.5", k === "Landing page" && "col-span-2")}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="font-medium break-all capitalize">{v}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 flex flex-col gap-1">
                    <dt className="text-xs text-muted-foreground">Platforms</dt>
                    <dd>
                      <PlatformIcons platforms={ad.platforms} />
                    </dd>
                  </div>
                </dl>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
