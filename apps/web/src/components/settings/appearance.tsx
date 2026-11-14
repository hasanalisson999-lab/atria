"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UI_THEMES, useUiTheme, type UiThemeId } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

/** A tiny, live mock of each style's own layout, drawn with its own tokens (data-ui scopes them to this card). */
function Preview({ id }: { id: UiThemeId }) {
  const shell = "relative h-36 overflow-hidden bg-background text-foreground";
  if (id === "cinema")
    return (
      <div data-ui={id} className={cn(shell, "flex flex-col gap-2 p-3")}>
        <div className="flex gap-3">
          <span className="h-14 w-10 rounded-md bg-pink/80" />
          <span className="flex flex-1 flex-col gap-1.5 pt-1">
            <span className="h-1.5 w-8 rounded-full bg-pink" />
            <span className="h-3 w-24 rounded-full bg-foreground/80" />
            <span className="h-3 w-16 rounded-full bg-foreground/80" />
            <span className="mt-1 h-3.5 w-14 rounded-full bg-pink" />
          </span>
        </div>
        <span className="h-1.5 w-16 rounded-full bg-foreground/50" />
        <div className="flex gap-1.5">
          {[10, 7, 10, 7, 10].map((w, i) => (
            <span key={i} className="h-12 rounded-md bg-foreground/20" style={{ width: w * 4 }} />
          ))}
        </div>
      </div>
    );
  if (id === "ledger")
    return (
      <div data-ui={id} className={cn(shell, "flex")}>
        <div className="flex w-7 flex-col items-center gap-1.5 border-r bg-surface py-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("size-3 rounded-[3px]", i === 0 ? "bg-pink" : "bg-foreground/15")} />
          ))}
        </div>
        <div className="flex flex-1 flex-col p-2">
          <div className="flex gap-2 border-b bg-surface px-1 py-1">
            {[6, 10, 16, 6].map((w, i) => (
              <span key={i} className="h-1.5 rounded-full bg-foreground/30" style={{ width: w * 3 }} />
            ))}
          </div>
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className={cn("flex items-center gap-2 border-b px-1 py-1.5", r === 1 && "bg-pink-soft")}>
              <span className="size-5 rounded-[3px] bg-foreground/25" />
              <span className="h-1.5 w-8 rounded-full bg-foreground/50" />
              <span className="h-1.5 w-16 rounded-full bg-foreground/20" />
              <span className="ml-auto h-1.5 w-5 rounded-full bg-pink/70" />
            </div>
          ))}
        </div>
      </div>
    );
  if (id === "pop")
    return (
      <div data-ui={id} className={cn(shell, "flex flex-col items-center gap-2 p-2.5")}>
        <span className="flex gap-1 rounded-full border-2 border-foreground bg-card p-0.5 shadow-[2px_2px_0_0_var(--foreground)]">
          <span className="h-2.5 w-6 rounded-full bg-lime" />
          <span className="h-2.5 w-7 rounded-full bg-pink" />
          <span className="h-2.5 w-7 rounded-full" />
        </span>
        <div className="flex w-full flex-1 flex-col gap-1.5 rounded-xl border-2 border-foreground bg-card p-2 shadow-[3px_3px_0_0_var(--foreground)]">
          <span className="flex items-center gap-1.5">
            <span className="size-4 rounded-full border-2 border-foreground" />
            <span className="h-2 w-12 rounded-full bg-foreground" />
            <span className="h-2.5 w-6 rotate-3 rounded-full bg-pink" />
          </span>
          <span className="flex flex-1 gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-9 rounded-md border-2 border-foreground bg-foreground/10" />
            ))}
          </span>
        </div>
      </div>
    );
  return (
    <div data-ui={id} className={shell}>
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
            <span key={i} className={cn("rounded-lg", i === 1 ? "bg-pink/70" : "bg-surface-2")} />
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
