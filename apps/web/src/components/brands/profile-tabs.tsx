"use client";

import { LayoutGroup, motion } from "motion/react";
import { useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";

export interface ProfileTab {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

/** Sticky category tabs for a brand profile, with a sliding underline and a soft panel entrance. */
export function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  // The open tab lives in the URL (?tab=hooks) so a refresh or a shared link keeps it.
  const [active, setActive] = useUrlState("tab", tabs[0]?.id ?? "", tabs.map((t) => t.id));
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="flex flex-col gap-6">
      <LayoutGroup id="brand-profile-tabs">
        <nav className="no-scrollbar sticky top-14 z-20 -mx-4 flex gap-1 overflow-x-auto border-b bg-background/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === active}
              onClick={() => {
                setActive(t.id);
                window.scrollTo({ top: Math.min(window.scrollY, 420), behavior: "smooth" });
              }}
              className={cn("relative flex h-12 shrink-0 items-center gap-1.5 px-3.5 text-sm font-medium transition-colors", t.id === active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-secondary px-1.5 font-mono text-[0.62rem] tabular-nums">{t.count}</span>}
              {t.id === active && <motion.span layoutId="profile-underline" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-pink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            </button>
          ))}
        </nav>
      </LayoutGroup>
      <div key={current?.id} className="animate-enter">
        {current?.content}
      </div>
    </div>
  );
}
