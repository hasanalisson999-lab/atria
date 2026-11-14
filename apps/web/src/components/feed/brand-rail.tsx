"use client";

import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { BrandAvatar } from "@/components/brand-avatar";
import { useUiTheme } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

export interface RailBrand {
  id: string;
  name: string;
  logo: string | null;
  small: string | null;
  ads: number;
  href: string;
  on: boolean;
}

/**
 * The row of brands above the Discover feed, drawn per interface style:
 * Atria round logos · Studio compact chips · Gallery a typeset index of names · Bento logo tiles · Feed story rings.
 * `all` is the "All brands" entry (only on the main row).
 */
export function BrandRail({ brands, all, title, hint }: { brands: RailBrand[]; all?: { href: string; on: boolean }; title?: string; hint?: string }) {
  const [ui] = useUiTheme();
  const heading = title && (
    <span
      className={cn(
        "flex items-center gap-2 text-xs font-semibold text-muted-foreground",
        ui === "studio" && "font-mono text-[0.68rem] tracking-[0.08em] uppercase",
        ui === "gallery" && "text-[0.66rem] tracking-[0.16em] uppercase",
      )}
    >
      {ui !== "gallery" && ui !== "studio" && <Sparkles className="size-3.5 text-pink-ink dark:text-pink" />} {title}
      {hint && <span className="font-normal normal-case">· {hint}</span>}
    </span>
  );

  if (ui === "gallery")
    return (
      <div className="flex flex-col gap-2.5">
        {heading}
        <p className="flex flex-wrap items-baseline gap-x-1 gap-y-1.5 text-[0.95rem] leading-snug font-light">
          {all && <IndexLink href={all.href} on={all.on} label="All" />}
          {brands.map((b) => (
            <IndexLink key={b.id} href={b.href} on={b.on} label={b.name} count={b.ads} />
          ))}
        </p>
      </div>
    );

  if (ui === "studio")
    return (
      <div className="flex flex-col gap-2">
        {heading}
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {all && (
            <Link href={all.href} scroll={false} className={cn("inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium", all.on ? "border-pink bg-pink-soft text-pink-ink" : "bg-card hover:bg-secondary")}>
              All brands
            </Link>
          )}
          {brands.map((b) => (
            <Link
              key={b.id}
              href={b.href}
              scroll={false}
              className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border pr-2 pl-1 text-xs font-medium", b.on ? "border-pink bg-pink-soft text-pink-ink" : "bg-card hover:bg-secondary")}
            >
              <BrandAvatar name={b.name} src={b.logo} fallbackSrc={b.small} className="size-5 rounded-[4px]" />
              <span className="max-w-[9rem] truncate">{b.name}</span>
              <span className="font-mono text-[0.62rem] text-muted-foreground tabular-nums">{b.ads}</span>
            </Link>
          ))}
        </div>
      </div>
    );

  if (ui === "bento")
    return (
      <div className="flex flex-col gap-2.5">
        {heading}
        <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {all && (
            <Link href={all.href} scroll={false} className={cn("flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-[1.3rem] p-2 transition-transform hover:-translate-y-0.5", all.on ? "bg-ink text-ink-foreground" : "bg-card")}>
              <span className="grid size-14 place-items-center rounded-[1rem] bg-[var(--tile-4)] text-lg font-bold text-foreground">All</span>
              <span className="text-[0.7rem] font-semibold">All brands</span>
            </Link>
          )}
          {brands.map((b, i) => (
            <Link
              key={b.id}
              href={b.href}
              scroll={false}
              title={`${b.name} · ${b.ads} creatives`}
              className={cn("flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-[1.3rem] p-2 transition-transform hover:-translate-y-0.5", b.on ? "bg-ink text-ink-foreground" : "bg-card")}
            >
              <span className="grid size-14 place-items-center rounded-[1rem]" style={{ background: `var(--tile-${(i % 6) + 1})` }}>
                <BrandAvatar name={b.name} src={b.logo} fallbackSrc={b.small} className="size-10 rounded-[0.7rem] border-0" />
              </span>
              <span className="w-full truncate text-center text-[0.7rem] font-semibold">{b.name}</span>
            </Link>
          ))}
        </div>
      </div>
    );

  if (ui === "feed")
    return (
      <div className="flex flex-col gap-2.5">
        {heading}
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {all && (
            <Link href={all.href} scroll={false} className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5">
              <span className={cn("grid size-16 place-items-center rounded-full border-2 bg-secondary", all.on ? "border-pink text-pink" : "border-border text-muted-foreground")}>
                <Plus className="size-6" />
              </span>
              <span className="w-full truncate text-center text-xs">All</span>
            </Link>
          )}
          {brands.map((b) => (
            <Link key={b.id} href={b.href} scroll={false} title={`${b.name} · ${b.ads} creatives`} className="group/st flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5">
              <span className={cn("size-16 rounded-full p-[4px] transition-transform group-hover/st:scale-105", b.on && "scale-105")} style={{ background: b.on ? "var(--pink)" : "var(--story-ring)" }}>
                <BrandAvatar name={b.name} src={b.logo} fallbackSrc={b.small} className="size-full ring-2 ring-background" />
              </span>
              <span className={cn("w-full truncate text-center text-xs", b.on && "font-semibold")}>{b.name}</span>
            </Link>
          ))}
        </div>
      </div>
    );

  // Atria
  return (
    <div className="flex flex-col gap-2">
      {heading}
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {all && (
          <Link href={all.href} scroll={false} className={cn("flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-colors hover:bg-secondary", all.on && "bg-secondary")}>
            <span className={cn("grid size-12 place-items-center rounded-full border bg-card font-display text-xs font-semibold", all.on && "ring-2 ring-pink ring-offset-2 ring-offset-background")}>All</span>
            <span className="w-full truncate text-center text-[0.7rem] font-medium">All brands</span>
          </Link>
        )}
        {brands.map((b) => (
          <Link
            key={b.id}
            href={b.href}
            scroll={false}
            title={`${b.name} · ${b.ads} creatives`}
            className={cn("group/brand flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-colors hover:bg-secondary", b.on && "bg-secondary")}
          >
            <BrandAvatar
              name={b.name}
              src={b.logo}
              fallbackSrc={b.small}
              className={cn("size-12 transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover/brand:scale-110", b.on && "ring-2 ring-pink ring-offset-2 ring-offset-background")}
            />
            <span className="w-full truncate text-center text-[0.7rem] font-medium">{b.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function IndexLink({ href, on, label, count }: { href: string; on: boolean; label: string; count?: number }) {
  return (
    <>
      <Link href={href} scroll={false} className={cn("decoration-1 underline-offset-4 transition-colors hover:underline", on ? "text-pink-ink underline" : "text-foreground")}>
        {label}
        {count !== undefined && <sup className="ml-0.5 text-[0.6rem] text-muted-foreground tabular-nums">{count}</sup>}
      </Link>
      <span aria-hidden className="text-muted-foreground/50 last:hidden">
        /
      </span>
    </>
  );
}
