"use client";

import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useUiTheme } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

export interface NicheTabItem {
  id: string;
  label: string;
  icon: string;
  count: number;
  href: string;
}

/**
 * The category switch above Discover, drawn per interface style:
 * Atria spring pills · Studio underlined tabs · Gallery large typeset words · Bento colour tiles · Feed chips.
 */
export function NicheTabs({ items, active }: { items: NicheTabItem[]; active: string }) {
  const [ui] = useUiTheme();

  if (ui === "studio")
    return (
      <LayoutGroup id="niche">
        <nav aria-label="Category" className="no-scrollbar flex overflow-x-auto border-b">
          {items.map((t) => {
            const on = t.id === active;
            return (
              <Link key={t.id} href={t.href} scroll={false} aria-current={on ? "page" : undefined} className={cn("relative flex h-9 shrink-0 items-center gap-2 px-3 text-[0.82rem] font-medium", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
                <span className="font-mono text-[0.66rem] text-muted-foreground tabular-nums">{t.count.toLocaleString()}</span>
                {on && <motion.span layoutId="niche-line" className="absolute inset-x-2 -bottom-px h-[2px] bg-pink" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
      </LayoutGroup>
    );

  if (ui === "gallery")
    return (
      <nav aria-label="Category" className="flex flex-wrap items-baseline gap-x-7 gap-y-1">
        {items.map((t) => {
          const on = t.id === active;
          return (
            <Link key={t.id} href={t.href} scroll={false} aria-current={on ? "page" : undefined} className={cn("text-[1.55rem] leading-tight font-light tracking-[-0.03em] transition-colors", on ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground")}>
              {t.label}
              <sup className={cn("ml-1 text-[0.62rem] tracking-normal tabular-nums", on ? "text-pink-ink" : "text-muted-foreground")}>{t.count.toLocaleString()}</sup>
            </Link>
          );
        })}
      </nav>
    );

  if (ui === "bento")
    return (
      <nav aria-label="Category" className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {items.map((t, i) => {
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              style={on ? undefined : { background: `var(--tile-${(i % 6) + 1})` }}
              className={cn("flex h-[5.5rem] w-36 shrink-0 flex-col justify-between rounded-[1.4rem] p-3 transition-transform hover:-translate-y-0.5", on && "bg-ink text-ink-foreground")}
            >
              <span className="flex items-start justify-between">
                <span className="text-2xl leading-none" aria-hidden>
                  {t.icon}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-bold tabular-nums", on ? "bg-pink text-black" : "bg-card/80")}>{t.count.toLocaleString()}</span>
              </span>
              <span className="truncate text-sm font-bold">{t.label}</span>
            </Link>
          );
        })}
      </nav>
    );

  if (ui === "feed")
    return (
      <nav aria-label="Category" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {items.map((t) => {
          const on = t.id === active;
          return (
            <Link key={t.id} href={t.href} scroll={false} aria-current={on ? "page" : undefined} className={cn("flex h-8 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors", on ? "bg-foreground text-background" : "bg-secondary hover:bg-accent")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    );

  // Atria: big segmented pills with a spring-animated active pill.
  return (
    <LayoutGroup id="niche">
      <nav aria-label="Category" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {items.map((t) => {
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn("relative flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200", on ? "text-ink-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}
            >
              {on && <motion.span layoutId="niche-pill" className="absolute inset-0 rounded-full bg-ink shadow-[var(--shadow-lift)]" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
              <span className="relative text-base leading-none" aria-hidden>
                {t.icon}
              </span>
              <span className="relative">{t.label}</span>
              <span className={cn("relative rounded-full px-1.5 py-px font-mono text-[0.65rem] tabular-nums", on ? "bg-pink text-[#0a0a0b]" : "bg-secondary")}>{t.count.toLocaleString()}</span>
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
