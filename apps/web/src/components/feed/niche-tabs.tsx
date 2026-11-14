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
 * Atria spring pills · Cinema genre buttons · Ledger underlined tabs with counts · Pop tilted stickers.
 */
export function NicheTabs({ items, active }: { items: NicheTabItem[]; active: string }) {
  const [ui] = useUiTheme();

  if (ui === "cinema")
    return (
      <nav aria-label="Category" className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
        {items.map((t) => {
          const on = t.id === active;
          return (
            <Link key={t.id} href={t.href} scroll={false} aria-current={on ? "page" : undefined} className={cn("flex h-9 shrink-0 items-center rounded-md border px-3.5 text-sm font-semibold transition-colors", on ? "border-pink bg-pink text-black" : "border-white/15 text-white/70 hover:border-white/40 hover:text-white")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    );

  if (ui === "ledger")
    return (
      <LayoutGroup id="niche">
        <nav aria-label="Category" className="no-scrollbar flex overflow-x-auto border-b">
          {items.map((t) => {
            const on = t.id === active;
            return (
              <Link key={t.id} href={t.href} scroll={false} aria-current={on ? "page" : undefined} className={cn("relative flex h-10 shrink-0 items-center gap-2 px-3 text-sm font-medium", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
                <span className="rounded-full bg-secondary px-1.5 font-mono text-[0.66rem] text-muted-foreground tabular-nums">{t.count.toLocaleString()}</span>
                {on && <motion.span layoutId="niche-line" className="absolute inset-x-2 -bottom-px h-[2px] bg-pink" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
      </LayoutGroup>
    );

  if (ui === "pop")
    return (
      <nav aria-label="Category" className="no-scrollbar -mx-1 flex items-center gap-3 overflow-x-auto px-1 py-2">
        {items.map((t, i) => {
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-2xl border-2 border-foreground px-4 text-sm font-black uppercase shadow-[3px_3px_0_0_var(--foreground)] transition-transform hover:-translate-y-0.5",
                on ? "bg-pink text-black" : "bg-card",
                i % 3 === 1 && "-rotate-1",
                i % 3 === 2 && "rotate-1",
              )}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
              <span className="text-[0.68rem] tabular-nums opacity-70">{t.count.toLocaleString()}</span>
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
