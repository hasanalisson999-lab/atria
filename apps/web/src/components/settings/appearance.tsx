"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UI_THEMES, useUiTheme, type UiThemeId } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

/** A tiny, live mock of each style's own layout, drawn with its own tokens (data-ui scopes them to this card). */
function Preview({ id }: { id: UiThemeId }) {
  const shell = "relative h-36 overflow-hidden bg-background text-foreground";
  if (id === "studio")
    return (
      <div data-ui={id} className={cn(shell, "flex")}>
        <div className="flex w-7 flex-col items-center gap-1.5 border-r bg-surface py-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("size-3 rounded-[3px]", i === 0 ? "bg-pink" : "bg-foreground/15")} />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <div className="flex gap-2 border-b pb-1">
            {[10, 8, 9].map((w, i) => (
              <span key={i} className={cn("h-1.5 rounded-full", i === 0 ? "bg-foreground/70" : "bg-foreground/20")} style={{ width: w * 4 }} />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-4 gap-px overflow-hidden rounded-[3px] border bg-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="checker flex items-center justify-center bg-card p-1">
                <span className={cn("h-full w-2/3 rounded-[2px]", i === 2 ? "bg-pink/70" : "bg-foreground/20")} />
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  if (id === "gallery")
    return (
      <div data-ui={id} className={cn(shell, "flex flex-col")}>
        <div className="flex items-center justify-center gap-3 border-b py-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1 w-6 rounded-full bg-foreground/30" />
          ))}
        </div>
        <div className="flex flex-1 items-start justify-center gap-4 px-4 pt-3">
          {["h-14", "h-16", "h-12"].map((h, i) => (
            <span key={i} className="flex w-14 flex-col gap-1">
              <span className="bg-card p-1.5 shadow-[var(--shadow-card)]">
                <span className={cn("block w-full", h, i === 1 ? "bg-pink/60" : "bg-surface-2")} />
              </span>
              <span className="h-1 w-8 bg-foreground/50" />
              <span className="h-1 w-10 bg-foreground/15" />
            </span>
          ))}
        </div>
      </div>
    );
  if (id === "bento")
    return (
      <div data-ui={id} className={cn(shell, "flex flex-col items-center gap-2 p-2")}>
        <span className="flex gap-1 rounded-full border bg-card p-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("h-2.5 w-7 rounded-full", i === 0 ? "bg-[var(--tile-2)]" : "bg-foreground/10")} />
          ))}
        </span>
        <div className="grid w-full flex-1 grid-cols-3 gap-1.5">
          {[1, 2, 3, 4, 5].map((t) => (
            <span key={t} className={cn("rounded-xl", t === 1 && "col-span-2")} style={{ background: `var(--tile-${t})` }} />
          ))}
          <span className="rounded-xl bg-pink" />
        </div>
      </div>
    );
  if (id === "feed")
    return (
      <div data-ui={id} className={cn(shell, "flex flex-col")}>
        <div className="flex h-6 items-center justify-center gap-4 border-b">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("size-2.5 rounded-[3px]", i === 0 ? "bg-pink" : "bg-foreground/25")} />
          ))}
        </div>
        <div className="flex gap-1.5 px-3 pt-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="size-5 rounded-full p-[1.5px]" style={{ background: "var(--story-ring)" }}>
              <span className="block size-full rounded-full border-2 border-background bg-surface-2" />
            </span>
          ))}
        </div>
        <div className="mx-auto mt-2 flex w-28 flex-1 flex-col overflow-hidden rounded-t-md border">
          <span className="flex items-center gap-1 p-1">
            <span className="size-2.5 rounded-full bg-foreground/30" />
            <span className="h-1 w-8 rounded-full bg-foreground/40" />
          </span>
          <span className="flex-1 bg-foreground/80" />
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
