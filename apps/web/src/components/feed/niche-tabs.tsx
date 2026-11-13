"use client";

import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface NicheTabItem {
  id: string;
  label: string;
  icon: string;
  count: number;
  href: string;
}

/** Big segmented niche switch with a spring-animated active pill. */
export function NicheTabs({ items, active }: { items: NicheTabItem[]; active: string }) {
  return (
    <LayoutGroup id="niche">
      <nav aria-label="Niche" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {items.map((t) => {
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200",
                on ? "text-ink-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
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
