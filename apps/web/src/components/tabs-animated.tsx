"use client";

import { LayoutGroup, motion } from "motion/react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedTab {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

/** Segmented tabs with a spring-animated active pill and a cross-fading panel. */
export function AnimatedTabs({ tabs, className }: { tabs: AnimatedTab[]; className?: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const group = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <LayoutGroup id={group}>
        <div role="tablist" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          <div className="inline-flex rounded-full border bg-surface p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={t.id === active}
                onClick={() => setActive(t.id)}
                className={cn(
                  "relative flex h-8 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-foreground",
                  t.id === active && "text-foreground",
                )}
              >
                {t.id === active && (
                  <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full border bg-card shadow-[var(--shadow-card)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                )}
                <span className="relative">{t.label}</span>
                {t.count !== undefined && <span className="relative font-mono text-[0.68rem] text-muted-foreground">{t.count}</span>}
              </button>
            ))}
          </div>
        </div>
      </LayoutGroup>
      <div role="tabpanel" key={current?.id} className="animate-enter">
        {current?.content}
      </div>
    </div>
  );
}
