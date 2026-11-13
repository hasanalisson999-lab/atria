"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/boards/save-button";
import { BrandAvatar } from "@/components/brand-avatar";
import type { FeedAd } from "@/lib/server/ads";
import { prefetchAnalysis } from "@/lib/analysis-queue";
import { adReason, ageChip } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hasUserActivation, setVolume, useVolume } from "@/lib/volume";

/** Hover volume: speaker toggles mute, slider sets level. Clicks never open the ad. */
function VolumeControl({ className }: { className?: string }) {
  const volume = useVolume();
  const [last, setLast] = useState(0.6);
  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div
      className={cn("group/vol flex items-center gap-1.5 rounded-full bg-black/60 p-1 text-white backdrop-blur-md", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={volume === 0 ? "Unmute" : "Mute"}
        onClick={() => {
          if (volume === 0) setVolume(last || 0.6);
          else {
            setLast(volume);
            setVolume(0);
          }
        }}
        className="grid size-7 place-items-center rounded-full transition-colors hover:bg-white/15"
      >
        <Icon className="size-3.5" />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        aria-label="Volume"
        onChange={(e) => setVolume(Number(e.target.value))}
        className="volume-slider w-0 opacity-0 transition-[width,opacity] duration-300 ease-[var(--ease-out-quart)] group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
        style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

/** Real width/height ratio per media URL, remembered so re-renders don't jump. */
const ratios = new Map<string, number>();
const clampRatio = (r: number) => Math.min(1.91, Math.max(0.5625, r));

export function AdTile({ ad, index, onOpen, selected }: { ad: FeedAd; index: number; onOpen: (id: string) => void; selected?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const volume = useVolume();
  const [inView, setInView] = useState(index < 10);
  const [hovering, setHovering] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [slide, setSlide] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const ratioKey = ad.thumbnail_url ?? ad.video_url ?? ad.id;
  const [ratio, setRatioState] = useState<number>(() => ratios.get(ratioKey) ?? 0.8);
  const setRatio = (w: number, h: number, final = false) => {
    if (!w || !h) return;
    const r = clampRatio(w / h);
    // The video's own frame wins over its poster image.
    if (final || !ratios.has(ratioKey)) ratios.set(ratioKey, r);
    setRatioState(ratios.get(ratioKey)!);
  };

  // Load video metadata (for the duration chip) only once the tile is near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setInView(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume || 0;
    v.muted = volume === 0;
  }, [volume]);

  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    setHovering(true);
    // Resting on a tile starts its AI breakdown, so the popup opens with it ready.
    prefetchTimer.current = setTimeout(() => prefetchAnalysis(ad.id, ad.has_analysis), 600);
    const v = videoRef.current;
    if (v) {
      const wantSound = volume > 0;
      v.volume = volume || 0;
      // Browsers only allow sound after the first click on the page; until then play muted and offer a button.
      v.muted = !wantSound || !hasUserActivation();
      setSoundBlocked(wantSound && v.muted);
      void v.play().catch(() => {
        v.muted = true;
        setSoundBlocked(wantSound);
        void v.play().catch(() => undefined);
      });
    }
  };
  const leave = () => {
    setHovering(false);
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    const v = videoRef.current;
    if (v) {
      // Pause where it is: coming back resumes from the same moment instead of restarting.
      v.pause();
      setPlaying(false);
    }
  };

  const gallery = ad.gallery.length > 1 ? ad.gallery : [];
  const isVideo = !!ad.video_url;
  const showImage = ad.thumbnail_url && !imgFailed;
  const age = ageChip(ad.days_running);
  const reason = adReason(ad);
  const REASON_TONE = { hot: "bg-pink text-[#0a0a0b]", scaled: "bg-ink text-ink-foreground", new: "bg-lime text-lime-ink", tracked: "bg-white/90 text-[#0a0a0b]" } as const;

  return (
    <div className="group/card flex flex-col gap-2" style={{ animation: "var(--animate-enter)", animationDelay: `${Math.min(index % 48, 15) * 35}ms` }}>
    <article
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${ad.brand_name ?? "Ad"}: ${ad.headline ?? ad.body_text?.slice(0, 60) ?? "open details"}`}
      onClick={() => onOpen(ad.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(ad.id))}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      className={cn(
        "group/tile relative w-full cursor-pointer overflow-hidden rounded-[20px] bg-surface-2 outline-none",
        "transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-quart)] hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] focus-visible:ring-3 focus-visible:ring-ring/60",
        selected && "ring-3 ring-pink",
      )}
      style={{ aspectRatio: showImage || isVideo || gallery.length ? ratio : 0.8 }}
    >
      {/* Media: the tile takes the creative's real shape, so nothing is cropped or letterboxed. */}
      {gallery.length ? (
        <div className="absolute inset-0 flex transition-transform duration-500 ease-[var(--ease-out-quart)]" style={{ transform: `translateX(-${slide * 100}%)` }}>
          {gallery.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" referrerPolicy="no-referrer" loading={i === 0 && index < 10 ? "eager" : "lazy"} onLoad={i === 0 ? (e) => setRatio(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight) : undefined} className="h-full w-full shrink-0 object-cover" />
          ))}
        </div>
      ) : showImage ? (
        <>
          {!imgLoaded && <div className="skeleton-shimmer absolute inset-0" />}
          {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN media */}
          <img
            src={ad.thumbnail_url!}
            alt=""
            referrerPolicy="no-referrer"
            loading={index < 10 ? "eager" : "lazy"}
            onLoad={(e) => {
              setRatio(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
              setImgLoaded(true);
            }}
            onError={() => setImgFailed(true)}
            className={cn("absolute inset-0 size-full object-cover transition-[opacity,transform] duration-700 ease-[var(--ease-out-quart)]", imgLoaded ? "opacity-100" : "opacity-0", hovering && !isVideo && "scale-[1.03]")}
          />
        </>
      ) : isVideo ? (
        <div className="skeleton-shimmer absolute inset-0" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f3f1ee] p-6 text-center dark:bg-surface">
          <p className="line-clamp-[10] text-[0.95rem] leading-snug font-medium text-[#1a1a1a] dark:text-foreground">{ad.body_text ?? ad.headline ?? "Text ad"}</p>
        </div>
      )}
      {isVideo && (
        <video
          ref={videoRef}
          // No poster image: show the video's first frame at rest instead of a blank tile.
          src={inView ? (showImage ? ad.video_url! : `${ad.video_url}#t=0.1`) : undefined}
          preload={inView ? "metadata" : "none"}
          muted
          loop
          playsInline
          onLoadedMetadata={(e) => {
            setRatio(e.currentTarget.videoWidth, e.currentTarget.videoHeight, true);
          }}
          onPlaying={() => setPlaying(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", (hovering && playing) || !showImage ? "opacity-100" : "opacity-0")}
        />
      )}

      {/* At rest: one chip at most, saying why this ad is worth a look */}
      {reason && (
        <span
          title={reason.why}
          className={cn(
            "pointer-events-none absolute top-2.5 left-2.5 z-[2] inline-flex h-6 items-center rounded-full px-2.5 text-[0.66rem] font-semibold shadow-sm transition-opacity duration-200 group-hover/tile:opacity-0",
            REASON_TONE[reason.tone],
          )}
        >
          {reason.label}
        </span>
      )}

      {/* Carousel controls */}
      {gallery.length > 1 && (
        <>
          {[-1, 1].map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={dir < 0 ? "Previous image" : "Next image"}
              onClick={(e) => {
                e.stopPropagation();
                setSlide((s) => (s + dir + gallery.length) % gallery.length);
              }}
              className={cn(
                "absolute top-1/2 z-[3] grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black opacity-0 shadow transition-[opacity,transform] duration-200 group-hover/tile:opacity-100 hover:scale-110",
                dir < 0 ? "left-2" : "right-2",
              )}
            >
              {dir < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ))}
          <span className="absolute bottom-3 left-1/2 z-[3] flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover/tile:opacity-100">
            {gallery.map((g, k) => (
              <span key={g} className={cn("h-1.5 rounded-full bg-white/60 transition-all duration-300", k === slide ? "w-4 bg-white" : "w-1.5")} />
            ))}
          </span>
        </>
      )}

      {/* Nothing covers the creative on hover (so its own text and offer stay readable); only video controls sit on it. */}
      {isVideo && soundBlocked && hovering && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const v = videoRef.current;
            if (v) {
              v.muted = false;
              v.volume = volume || 0.7;
              void v.play();
            }
            setSoundBlocked(false);
          }}
          className="absolute bottom-3 left-2.5 z-[4] inline-flex h-7 animate-enter items-center gap-1.5 rounded-full bg-white/95 px-3 text-[0.72rem] font-semibold text-[#0a0a0b] shadow-lg transition-transform hover:scale-105"
        >
          <Volume2 className="size-3.5" /> Click for sound
        </button>
      )}
      {isVideo && (
        <>
          <VolumeControl className="absolute right-2.5 bottom-3 z-[3] translate-y-1 opacity-0 transition-[opacity,transform] duration-300 group-hover/tile:translate-y-0 group-hover/tile:opacity-100" />
          <div className="absolute inset-x-0 bottom-0 z-[3] h-[3px] bg-white/15 opacity-0 transition-opacity group-hover/tile:opacity-100">
            <div className="h-full origin-left bg-pink" style={{ transform: `scaleX(${progress})` }} />
          </div>
        </>
      )}
    </article>
      {/* Caption under the ad: brand and age at rest; Save and Shop take the age's place on hover. */}
      <div className="flex h-7 min-w-0 items-center gap-2 px-0.5">
        <button type="button" onClick={() => onOpen(ad.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <BrandAvatar name={ad.brand_name} src={ad.brand_logo} fallbackSrc={ad.brand_logo_small} className="size-6" />
          <span className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold">{ad.brand_name ?? "Unknown brand"}</span>
          <span className="flex shrink-0 items-center gap-1 text-[0.7rem] text-muted-foreground tabular-nums group-focus-within/card:hidden group-hover/card:hidden">
            <span className={cn("size-1.5 rounded-full", ad.is_active ? "bg-ok" : "bg-muted-foreground/50")} />
            {age ?? "—"}
          </span>
        </button>
        <div className="hidden shrink-0 items-center gap-1 group-focus-within/card:flex group-hover/card:flex [@media(hover:none)]:flex">
          <SaveButton adId={ad.id} variant="icon" />
          {ad.landing_url && (
            <a
              href={ad.landing_url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              title={`Open the product page${ad.landing_domain ? ` · ${ad.landing_domain}` : ""}`}
              className="group/shop inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-pink pr-2 pl-2.5 text-[0.72rem] font-semibold text-[#0a0a0b] transition-[box-shadow,transform] hover:shadow-[var(--glow-pink)] active:scale-95"
            >
              Shop
              <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover/shop:rotate-45" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
