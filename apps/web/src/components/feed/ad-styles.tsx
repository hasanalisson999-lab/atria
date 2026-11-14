"use client";

import { ArrowUpRight, ChevronRight, Layers, Play, Wand2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { SaveButton } from "@/components/boards/save-button";
import { BrandAvatar } from "@/components/brand-avatar";
import type { FeedAd } from "@/lib/server/ads";
import { adReason, ageChip, daysText } from "@/lib/format";
import { sized } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * How ads are laid out in each interface style (Atria keeps the masonry wall in ad-grid.tsx). Every layout
 * shows the whole creative: nothing is cropped or zoomed.
 *   Studio  → AdSheet:  a contact sheet, uniform cells, metadata in mono under each
 *   Gallery → AdFrames: framed work on a white wall with a museum label
 *   Bento   → AdBento:  colour tiles, every few a wide feature tile
 *   Feed    → AdPosts:  social posts with a header, the creative, a CTA bar and a caption
 */
type Props = { ads: FeedAd[]; onOpen: (id: string) => void; openId: string | null };

const EASE = [0.22, 1, 0.36, 1] as const;
const enter = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: Math.min(i % 24, 12) * 0.03, ease: EASE } });
const copyOf = (ad: FeedAd) => (ad.headline || ad.body_text || "").replace(/\s+/g, " ").trim();
const kind = (ad: FeedAd) => (ad.video_url || ad.format === "video" ? "Video" : ad.gallery.length > 1 ? "Carousel" : "Image");
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const onKey = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
};

/**
 * The creative, never cropped. "contain" fits it inside a fixed box; "natural" keeps its own shape (capped
 * at a maximum height, centred). Light resized image first, the original as fallback.
 */
function Media({ ad, width, fit, className, maxH = "max-h-[80vh]" }: { ad: FeedAd; width: number; fit: "contain" | "natural"; className?: string; maxH?: string }) {
  const [src, setSrc] = useState(sized(ad.thumbnail_url, width));
  const [failed, setFailed] = useState(false);
  const img = fit === "natural" ? cn("mx-auto block h-auto w-auto max-w-full", maxH) : "absolute inset-0 size-full object-contain";
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {ad.thumbnail_url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote ad creative
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => (src !== ad.thumbnail_url ? setSrc(ad.thumbnail_url!) : setFailed(true))} className={img} />
      ) : ad.video_url ? (
        <video src={`${ad.video_url}#t=0.1`} preload="metadata" muted playsInline className={img} />
      ) : (
        <p className={cn("line-clamp-6 p-5 text-sm leading-snug", fit === "contain" && "absolute inset-0 grid place-items-center text-center")}>{copyOf(ad) || "Text ad"}</p>
      )}
      {ad.video_url && (
        <span className="pointer-events-none absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
          <Play className="size-3.5 fill-current" />
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Studio: contact sheet

export function AdSheet({ ads, onOpen, openId }: Props) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {ads.map((ad, i) => {
        const on = openId === ad.id;
        return (
          <motion.div
            key={ad.id}
            {...enter(i)}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(ad.id)}
            onKeyDown={onKey(() => onOpen(ad.id))}
            className={cn("group/s relative flex cursor-pointer flex-col bg-card outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-pink", on && "z-10 ring-2 ring-pink")}
          >
            <Media ad={ad} width={360} fit="contain" className="checker aspect-square m-2 rounded-[4px]" />
            <div className="flex flex-col gap-0.5 border-t px-2.5 py-2 font-mono text-[0.68rem] leading-tight">
              <span className="flex items-center gap-1.5">
                <span className={cn("size-1.5 shrink-0 rounded-full", ad.is_active ? "bg-ok" : "bg-muted-foreground/40")} />
                <span className="truncate font-sans text-[0.78rem] font-semibold">{ad.brand_name}</span>
                <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{ageChip(ad.days_running) ?? "new"}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground uppercase">
                {kind(ad)}
                {ad.variants > 1 && <span>· {ad.variants} ver</span>}
                {ad.cta && <span className="truncate">· {ad.cta}</span>}
              </span>
            </div>
            <span className="absolute top-3 left-3 opacity-0 transition-opacity group-hover/s:opacity-100" onClick={stop}>
              <SaveButton adId={ad.id} variant="icon" />
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Gallery: framed work on a wall

export function AdFrames({ ads, onOpen, openId }: Props) {
  return (
    <div className="columns-1 gap-10 sm:columns-2 xl:columns-3">
      {ads.map((ad, i) => (
        <motion.figure key={ad.id} {...enter(i)} className="mb-14 break-inside-avoid">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(ad.id)}
            onKeyDown={onKey(() => onOpen(ad.id))}
            className={cn(
              "cursor-pointer bg-card p-[7%] shadow-[var(--shadow-card)] transition-shadow duration-500 outline-none hover:shadow-[var(--shadow-lift)] focus-visible:ring-2 focus-visible:ring-pink",
              openId === ad.id && "shadow-[var(--shadow-lift)] ring-1 ring-pink",
            )}
          >
            <Media ad={ad} width={640} fit="natural" maxH="max-h-[70vh]" />
          </div>
          <figcaption className="mt-4 flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[0.66rem] font-semibold tracking-[0.16em] uppercase">{ad.brand_name}</span>
              <span className="line-clamp-2 text-[0.95rem] leading-snug font-light">{ad.headline || copyOf(ad) || `${kind(ad)} ad`}</span>
              <span className="text-xs text-muted-foreground">
                {kind(ad)}, {daysText(ad.days_running)?.toLowerCase() ?? "new"}
                {ad.is_active ? ", running" : ", stopped"}
              </span>
            </div>
            <SaveButton adId={ad.id} variant="icon" />
          </figcaption>
        </motion.figure>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Bento: colour tiles

export function AdBento({ ads, onOpen, openId }: Props) {
  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
      {ads.map((ad, i) => {
        const wide = i % 7 === 0;
        const tint = { background: `var(--tile-${(i % 6) + 1})` };
        return (
          <motion.div
            key={ad.id}
            {...enter(i)}
            whileHover={{ y: -4 }}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(ad.id)}
            onKeyDown={onKey(() => onOpen(ad.id))}
            style={tint}
            className={cn("group/b flex cursor-pointer gap-3 rounded-[1.6rem] p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-pink", wide ? "col-span-2 flex-col sm:flex-row" : "flex-col", openId === ad.id && "ring-[3px] ring-foreground")}
          >
            <Media ad={ad} width={wide ? 560 : 420} fit="contain" className={cn("aspect-square rounded-[1.2rem] bg-black/[0.06] dark:bg-white/[0.04]", wide && "sm:w-1/2 sm:shrink-0")} />
            <div className={cn("flex min-w-0 flex-col gap-2 px-1.5 pb-1", wide && "sm:justify-center sm:py-3 sm:pr-3")}>
              <span className="flex items-center gap-2">
                <BrandAvatar name={ad.brand_name} src={ad.brand_logo} fallbackSrc={ad.brand_logo_small} className="size-7 ring-2 ring-white/70 dark:ring-black/30" />
                <span className="truncate text-sm font-bold">{ad.brand_name}</span>
                <span className="ml-auto shrink-0 rounded-full bg-card/80 px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums">{ageChip(ad.days_running) ?? "new"}</span>
              </span>
              {wide && <p className="line-clamp-3 text-xl leading-tight font-bold tracking-[-0.02em]">{ad.headline || copyOf(ad) || `${kind(ad)} ad`}</p>}
              {wide && ad.body_text && ad.headline && <p className="line-clamp-3 text-sm text-foreground/70">{ad.body_text}</p>}
              <span className="flex items-center gap-1.5" onClick={stop}>
                {ad.cta && <span className="rounded-full bg-ink px-2.5 py-1 text-[0.72rem] font-semibold text-ink-foreground">{ad.cta}</span>}
                <span className="rounded-full bg-card/80 px-2.5 py-1 text-[0.72rem] font-semibold">{kind(ad)}</span>
                <span className="ml-auto">
                  <SaveButton adId={ad.id} variant="icon" />
                </span>
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Feed: social posts

/** Brand photo inside a story ring (the ring only while the ad is running). */
export function StoryAvatar({ name, src, fallback, live, className }: { name: string | null; src: string | null; fallback: string | null; live: boolean; className?: string }) {
  return (
    <span className={cn("shrink-0 rounded-full p-[3px]", className)} style={{ background: live ? "var(--story-ring)" : "var(--border)" }}>
      <BrandAvatar name={name} src={src} fallbackSrc={fallback} className="size-full ring-[1.5px] ring-background" />
    </span>
  );
}

export function AdPosts({ ads, onOpen, openId }: Props) {
  return (
    <div className="mx-auto w-full max-w-[1080px] columns-1 gap-6 lg:columns-2">
      {ads.map((ad, i) => {
        const reason = adReason(ad);
        const open = () => onOpen(ad.id);
        return (
          <motion.article key={ad.id} {...enter(i)} className={cn("mb-6 break-inside-avoid overflow-hidden rounded-xl border bg-card", openId === ad.id && "ring-2 ring-pink")}>
            <header className="flex items-center gap-2.5 px-3.5 py-3">
              <StoryAvatar name={ad.brand_name} src={ad.brand_logo} fallback={ad.brand_logo_small} live={ad.is_active} className="size-9" />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                {ad.brand_id ? (
                  <Link href={`/brands/${ad.brand_id}`} className="truncate text-sm font-semibold hover:underline">
                    {ad.brand_name}
                  </Link>
                ) : (
                  <span className="truncate text-sm font-semibold">{ad.brand_name}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  Sponsored · {ageChip(ad.days_running) ?? "new"}
                  {reason && <span className="font-semibold text-pink-ink"> · {reason.label}</span>}
                </span>
              </div>
              {ad.variants > 1 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Versions of this creative">
                  <Layers className="size-3.5" /> {ad.variants}
                </span>
              )}
            </header>
            <div role="button" tabIndex={0} onClick={open} onKeyDown={onKey(open)} className="cursor-pointer bg-black outline-none focus-visible:ring-2 focus-visible:ring-pink">
              <Media ad={ad} width={720} fit="natural" maxH="max-h-[720px]" />
            </div>
            {ad.cta &&
              (ad.landing_url ? (
                <a href={ad.landing_url} target="_blank" rel="noreferrer noopener" className="flex items-center justify-between border-b bg-secondary px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent">
                  {ad.cta}
                  <ChevronRight className="size-4" />
                </a>
              ) : (
                <span className="flex items-center justify-between border-b bg-secondary px-3.5 py-2.5 text-sm font-semibold">{ad.cta}</span>
              ))}
            <div className="flex items-center gap-1 px-2 pt-2">
              <SaveButton adId={ad.id} variant="icon" />
              <Link href={`/lab/remix/${ad.id}`} title="Remix for your brand" className="grid size-9 place-items-center rounded-full hover:bg-secondary">
                <Wand2 className="size-[1.15rem]" />
              </Link>
              {ad.landing_url && (
                <a href={ad.landing_url} target="_blank" rel="noreferrer noopener" title={ad.landing_domain ?? "Open landing page"} className="grid size-9 place-items-center rounded-full hover:bg-secondary">
                  <ArrowUpRight className="size-[1.15rem]" />
                </a>
              )}
              <button onClick={open} className="ml-auto px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                {ad.has_analysis ? "See breakdown" : "Break it down"}
              </button>
            </div>
            {copyOf(ad) && (
              <p className="line-clamp-3 px-3.5 pt-1.5 pb-3.5 text-sm leading-snug">
                <span className="font-semibold">{ad.brand_name}</span> <span>{ad.headline && ad.body_text ? `${ad.headline}. ${ad.body_text}` : copyOf(ad)}</span>
              </p>
            )}
          </motion.article>
        );
      })}
    </div>
  );
}
