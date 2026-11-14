"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UI_THEMES, useUiTheme, type UiThemeId } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

/** A tiny, live mock of the app drawn with the style's own tokens (data-ui scopes them to this card). */
function Preview({ id }: { id: UiThemeId }) {
  return (
    <div data-ui={id} className="relative h-36 overflow-hidden bg-background text-foreground" style={{ backgroundImage: "var(--ui-canvas, none)" }}>
      <div className="absolute inset-y-0 left-0 flex w-14 flex-col gap-1.5 border-r bg-surface p-2">
        <span className="size-3.5 rounded-md bg-pink" />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-2 rounded-full", i === 0 ? "bg-foreground/70" : "bg-foreground/15")} />
        ))}
      </div>
      <div className="absolute inset-y-0 right-0 left-14 flex flex-col gap-2 p-3">
        <span className="font-display text-[0.95rem] leading-none font-semibold tracking-tight">Ads that work.</span>
        <div className="flex gap-1">
          <span className="h-3.5 w-10 rounded-full bg-foreground" />
          <span className="h-3.5 w-8 rounded-full bg-secondary" />
          <span className="h-3.5 w-8 rounded-full bg-secondary" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-1 rounded-lg border bg-card p-1 shadow-[var(--shadow-card)]">
              <span className={cn("flex-1 rounded-md", i === 1 ? "bg-pink/70" : "bg-surface-2")} />
              <span className="h-1.5 w-2/3 rounded-full bg-foreground/25" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Settings → Appearance: light/dark mode and the interface style for the whole app. */
export function Appearance() {
  const [current, setTheme] = useUiTheme();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Mode</span>
          <span className="text-xs text-muted-foreground">Every style comes in light and dark.</span>
        </div>
        <ThemeToggle className="w-[7.5rem]" />
      </div>
      <div role="radiogroup" aria-label="Interface style" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {UI_THEMES.map((t, i) => {
          const on = t.id === current;
          return (
            <motion.button
              key={t.id}
              role="radio"
              aria-checked={on}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              onClick={(e) => setTheme(t.id, { x: e.clientX, y: e.clientY })}
              className={cn(
                "group/t relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-[box-shadow,border-color] duration-300",
                on ? "border-foreground shadow-[var(--shadow-lift)]" : "hover:border-foreground/30 hover:shadow-[var(--shadow-lift)]",
              )}
            >
              <Preview id={t.id} />
              <span className="flex items-start gap-3 border-t p-4">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{t.description}</span>
                </span>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border transition-colors", on ? "border-foreground bg-foreground text-background" : "border-border")}>
                  {on && <Check className="size-3" />}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
