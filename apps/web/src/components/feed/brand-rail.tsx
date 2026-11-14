"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { BrandAvatar } from "@/components/brand-avatar";
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
 * The row of brands above the Discover feed (Atria). Cinema, Ledger and Pop hide it: they show brands their own way.
 * `all` is the "All brands" entry (only on the main row).
 */
export function BrandRail({ brands, all, title, hint }: { brands: RailBrand[]; all?: { href: string; on: boolean }; title?: string; hint?: string }) {
    const heading = title && (
    <span
      className={cn(
        "flex items-center gap-2 text-xs font-semibold text-muted-foreground",
      )}
    >
      <Sparkles className="size-3.5 text-pink-ink dark:text-pink" /> {title}
      {hint && <span className="font-normal normal-case">· {hint}</span>}
    </span>
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
