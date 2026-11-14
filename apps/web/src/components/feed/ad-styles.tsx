"use client";

import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SaveButton } from "@/components/boards/save-button";
import { BrandAvatar } from "@/components/brand-avatar";
import type { FeedAd } from "@/lib/server/ads";
import { adReason, ageChip, daysText } from "@/lib/format";
import { sized } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * How ads are laid out in each interface style (Atria keeps the masonry wall in ad-grid.tsx). Every layout
 * shows the whole creative at its own shape, with nothing painted behind it.
 *   Cinema → AdCinema: one featured ad, then shelves you scroll sideways
 *   Ledger → AdLedger: a table, one row per ad
 *   Pop    → AdByBrand: ads grouped under big brand stickers
 */
type Props = { ads: FeedAd[]; onOpen: (id: string) => void; openId: string | null };

const EASE = [0.22, 1, 0.36, 1] as const;
const enter = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: Math.min(i % 16, 10) * 0.035, ease: EASE } });
const copyOf = (ad: FeedAd) => (ad.headline || ad.body_text || "").replace(/\s+/g, " ").trim();
const kind = (ad: FeedAd) => (ad.video_url || ad.format === "video" ? "Video" : ad.gallery.length > 1 ? "Carousel" : "Image");
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * The creative, never cropped and never on a fill. "height": fixed height, natural width (shelves).
 * "box": fits inside the box its parent gives it. "natural": its own shape, capped by maxH.
 */
function Media({ ad, width, fit, className, maxH = "max-h-[70vh]" }: { ad: FeedAd; width: number; fit: "height" | "box" | "natural"; className?: string; maxH?: string }) {
  const [src, setSrc] = useState(sized(ad.thumbnail_url, width));
  const [failed, setFailed] = useState(false);
  const cls = fit === "height" ? "block h-full w-auto max-w-none" : fit === "box" ? "max-h-full max-w-full object-contain" : cn("block h-auto w-auto max-w-full", maxH);
  return (
    <div className={cn("relative", fit === "box" && "flex items-center justify-center", className)}>
      {ad.thumbnail_url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote ad creative
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => (src !== ad.thumbnail_url ? setSrc(ad.thumbnail_url!) : setFailed(true))} className={cn(cls, "rounded-[inherit]")} />
      ) : ad.video_url ? (
        <video src={`${ad.video_url}#t=0.1`} preload="metadata" muted playsInline className={cn(cls, "rounded-[inherit]")} />
      ) : (
        <p className={cn("line-clamp-6 p-4 text-sm leading-snug", fit === "height" && "w-56")}>{copyOf(ad) || "Text ad"}</p>
      )}
      {ad.video_url && fit !== "box" && (
        <span className="pointer-events-none absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur">
          <Play className="size-3.5 fill-current" />
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Cinema: featured ad + shelves

const SHELVES: { title: string; hint?: string; test: (a: FeedAd) => boolean }[] = [
  { title: "Proven winners", hint: "running 60+ days", test: (a) => (a.days_running ?? 0) >= 60 },
  { title: "Scaled creatives", hint: "brands made several versions", test: (a) => a.variants > 1 },
  { title: "Video ads", test: (a) => !!a.video_url || a.format === "video" },
  { title: "Fresh launches", hint: "last two weeks", test: (a) => (a.days_running ?? 999) <= 14 },
  { title: "More to watch", test: () => true },
];

export function AdCinema({ ads, onOpen, openId }: Props) {
  const hero = ads[0];
  const shelves = useMemo(() => {
    const out = SHELVES.map((s) => ({ ...s, ads: [] as FeedAd[] }));
    for (const ad of ads.slice(1)) out.find((s) => s.test(ad))!.ads.push(ad);
    return out.filter((s) => s.ads.length);
  }, [ads]);
  if (!hero) return null;
  return (
    <div className="flex flex-col gap-12">
      <motion.section {...enter(0)} className="grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-14">
        <button onClick={() => onOpen(hero.id)} className="mx-auto overflow-hidden rounded-2xl shadow-[var(--shadow-lift)] transition-shadow hover:shadow-[var(--glow-pink)]">
          <Media ad={hero} width={720} fit="natural" maxH="max-h-[64vh]" />
        </button>
        <div className="flex max-w-2xl flex-col gap-5">
          <span className="text-xs font-bold tracking-[0.2em] text-pink uppercase">Featured</span>
          <span className="flex items-center gap-2.5">
            <BrandAvatar name={hero.brand_name} src={hero.brand_logo} fallbackSrc={hero.brand_logo_small} className="size-9" />
            <span className="text-lg font-semibold">{hero.brand_name}</span>
          </span>
          <h2 className="font-display line-clamp-3 text-[2.4rem] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[3.2rem]">{hero.headline || copyOf(hero) || `${kind(hero)} ad`}</h2>
          {hero.body_text && hero.headline && <p className="line-clamp-3 text-base leading-relaxed text-muted-foreground">{hero.body_text}</p>}
          <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span className={cn("font-semibold", hero.is_active ? "text-ok" : "")}>{hero.is_active ? "Running" : "Stopped"}</span>
            <span>{daysText(hero.days_running) ?? "New"}</span>
            <span>{kind(hero)}</span>
            {hero.variants > 1 && <span>{hero.variants} versions</span>}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => onOpen(hero.id)} className="inline-flex h-12 items-center gap-2 rounded-full bg-pink px-6 text-sm font-bold text-black transition-shadow hover:shadow-[var(--glow-pink)]">
              <Play className="size-4 fill-current" /> Open the breakdown
            </button>
            {hero.landing_url && (
              <a href={hero.landing_url} target="_blank" rel="noreferrer noopener" className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold hover:bg-white/15">
                {hero.cta ?? "Visit"} <ArrowUpRight className="size-4" />
              </a>
            )}
            <SaveButton adId={hero.id} />
          </div>
        </div>
      </motion.section>

      {shelves.map((s) => (
        <section key={s.title} className="flex flex-col gap-3">
          <h3 className="flex items-baseline gap-3">
            <span className="font-display text-xl font-bold tracking-[-0.02em]">{s.title}</span>
            {s.hint && <span className="text-sm text-muted-foreground">{s.hint}</span>}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{s.ads.length}</span>
          </h3>
          <div className="no-scrollbar -mx-4 flex items-start gap-4 overflow-x-auto px-4 pt-1 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
            {s.ads.map((ad, i) => (
              <motion.button key={ad.id} {...enter(i)} onClick={() => onOpen(ad.id)} className="group/c flex shrink-0 flex-col gap-2 text-left">
                <span className={cn("block overflow-hidden rounded-xl ring-2 ring-transparent transition-[box-shadow,transform] duration-300 group-hover/c:-translate-y-1 group-hover/c:ring-pink", openId === ad.id && "ring-pink")}>
                  <Media ad={ad} width={420} fit="height" className="h-[300px]" />
                </span>
                <span className="flex max-w-[240px] items-center gap-2 text-sm">
                  <span className="truncate font-semibold">{ad.brand_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ageChip(ad.days_running) ?? "new"}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Ledger: a table

export function AdLedger({ ads, onOpen, openId }: Props) {
  const th = "px-3 py-2.5 text-left text-[0.72rem] font-semibold text-muted-foreground";
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-surface">
          <tr>
            <th className={cn(th, "w-24")}>Creative</th>
            <th className={th}>Brand</th>
            <th className={th}>Copy</th>
            <th className={cn(th, "hidden md:table-cell")}>Format</th>
            <th className={th}>Running</th>
            <th className={cn(th, "hidden lg:table-cell")}>Versions</th>
            <th className={cn(th, "hidden xl:table-cell")}>Call to action</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {ads.map((ad) => {
            const reason = adReason(ad);
            return (
              <tr key={ad.id} onClick={() => onOpen(ad.id)} className={cn("cursor-pointer border-t align-middle transition-colors hover:bg-surface", openId === ad.id && "bg-pink-soft hover:bg-pink-soft")}>
                <td className="p-2">
                  <Media ad={ad} width={200} fit="box" className="size-20 rounded-[4px]" />
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <BrandAvatar name={ad.brand_name} src={ad.brand_logo} fallbackSrc={ad.brand_logo_small} className="size-6 rounded-[4px]" />
                    {ad.brand_id ? (
                      <Link href={`/brands/${ad.brand_id}`} onClick={stop} className="max-w-[10rem] truncate font-medium hover:underline">
                        {ad.brand_name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{ad.brand_name}</span>
                    )}
                  </span>
                </td>
                <td className="max-w-[28rem] px-3 py-2">
                  <p className="line-clamp-1 font-medium">{ad.headline || copyOf(ad) || "—"}</p>
                  {ad.headline && ad.body_text && <p className="line-clamp-1 text-muted-foreground">{ad.body_text}</p>}
                  {reason && <span className="mt-0.5 inline-block text-[0.7rem] font-semibold text-pink-ink">{reason.label}</span>}
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <span className="rounded-[4px] border px-1.5 py-0.5 text-xs">{kind(ad)}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  <span className={cn("mr-1.5 inline-block size-1.5 rounded-full align-middle", ad.is_active ? "bg-ok" : "bg-muted-foreground/40")} />
                  {daysText(ad.days_running) ?? "New"}
                </td>
                <td className="hidden px-3 py-2 tabular-nums lg:table-cell">{ad.variants > 1 ? ad.variants : "—"}</td>
                <td className="hidden max-w-[12rem] px-3 py-2 xl:table-cell">
                  {ad.cta ? (
                    <span className="flex flex-col leading-tight">
                      <span className="font-medium">{ad.cta}</span>
                      {ad.landing_domain && <span className="truncate text-xs text-muted-foreground">{ad.landing_domain}</span>}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2" onClick={stop}>
                  <SaveButton adId={ad.id} variant="icon" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ Pop: grouped by brand

export function AdByBrand({ ads, onOpen, openId }: Props) {
  const groups = useMemo(() => {
    const m = new Map<string, FeedAd[]>();
    for (const ad of ads) {
      const k = ad.brand_id ?? ad.brand_name ?? "?";
      m.set(k, [...(m.get(k) ?? []), ad]);
    }
    return [...m.values()];
  }, [ads]);
  return (
    <div className="columns-1 gap-6 md:columns-2 2xl:columns-3">
      {groups.map((g, gi) => {
        const b = g[0]!;
        return (
          <motion.section key={b.brand_id ?? gi} {...enter(gi)} className="mb-6 break-inside-avoid rounded-[1.8rem] border-2 border-foreground bg-card p-4 shadow-[5px_5px_0_0_var(--foreground)] sm:p-5">
            <header className="mb-4 flex flex-wrap items-center gap-3">
              <BrandAvatar name={b.brand_name} src={b.brand_logo} fallbackSrc={b.brand_logo_small} className="size-12 border-2 border-foreground" />
              <h3 className="font-display text-2xl font-extrabold tracking-[-0.02em] uppercase">{b.brand_name}</h3>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", gi % 2 ? "-rotate-2 bg-lime text-lime-ink" : "rotate-2 bg-pink text-black")}>
                {g.length} {g.length === 1 ? "ad" : "ads"}
              </span>
              {b.brand_id && (
                <Link href={`/brands/${b.brand_id}`} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-4 text-sm">
                  Brand page <ArrowRight className="size-4" />
                </Link>
              )}
            </header>
            <div className="no-scrollbar flex items-start gap-4 overflow-x-auto pb-2">
              {g.map((ad) => (
                <div key={ad.id} className="flex shrink-0 flex-col gap-2">
                  <button onClick={() => onOpen(ad.id)} className={cn("overflow-hidden rounded-2xl border-2 border-foreground transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5", openId === ad.id && "outline-3 outline-offset-2 outline-pink")}>
                    <Media ad={ad} width={400} fit="height" className="h-[260px]" />
                  </button>
                  <span className="flex max-w-[260px] items-center gap-2">
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[0.7rem] font-bold text-background">{ageChip(ad.days_running) ?? "new"}</span>
                    <span className="truncate text-xs font-semibold">{kind(ad)}</span>
                    <span className="ml-auto" onClick={stop}>
                      <SaveButton adId={ad.id} variant="icon" />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}
