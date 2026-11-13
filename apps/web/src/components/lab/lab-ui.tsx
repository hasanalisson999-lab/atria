"use client";

import { Check, Copy, ShieldCheck, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { detectFields, groupHits, textFields, type FieldHit } from "@/lib/slop";
import { cn } from "@/lib/utils";

export const EASE = [0.22, 1, 0.36, 1] as const;
export const arr = <T,>(v: T[] | undefined | null) => (Array.isArray(v) ? v : []);
/** "Beat 2: Cut to the gym" → "Cut to the gym" (the number is already shown). */
export const beat = (b: string) => b.replace(/^\s*(beat|scene|shot)\s*\d+\s*[:.\-–]\s*/i, "");
export const card = "rounded-2xl border bg-card shadow-[var(--shadow-card)]";

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export function useCopy(): [boolean, (text: string) => void] {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);
  return [
    done,
    (text: string) => {
      void navigator.clipboard.writeText(text).catch(() => {});
      setDone(true);
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setDone(false), 1400);
    },
  ];
}

export function CopyBtn({ text, className, label }: { text: string; className?: string; label?: string }) {
  const [done, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        label ? "px-2.5 text-xs font-medium" : "w-8",
        className,
      )}
      aria-label={label ?? "Copy"}
      title={label ?? "Copy"}
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
      {label && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}

/** Text with [bracketed placeholders] shown as fill-in chips, so the founder sees what to replace. */
export function Rich({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\[[^\]\n]{1,80}\])/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        /^\[[^\]]+\]$/.test(p) ? (
          <span key={i} title="Fill this in with your real detail" className="mx-px rounded-md bg-warn-soft px-1.5 py-px text-[0.92em] font-medium text-warn">
            {p.slice(1, -1)}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{children}</h2>
        {hint && <p className="text-[0.8rem] text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Writing({ label = "Reading your competitors' ads and writing this for your brand" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 animate-pulse text-pink" /> {label}…
      </span>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="skeleton-shimmer h-40 rounded-2xl md:col-span-3" />
        <div className="skeleton-shimmer h-32 rounded-2xl" />
        <div className="skeleton-shimmer h-32 rounded-2xl" />
        <div className="skeleton-shimmer h-32 rounded-2xl" />
      </div>
    </div>
  );
}

/** Live AI-pattern check for any generated object (scripts, positioning…), using the no-ai-slop rules. */
export function useSlop(data: unknown, prefix?: string): FieldHit[] {
  // Recomputed on every render; the scan is a few regexes over a few KB of text.
  return data ? detectFields(textFields(data, prefix)) : [];
}

/** "Reads human" badge with a dropdown listing any AI patterns that are left. */
export function HumanBadge({ hits, fixed, className }: { hits: FieldHit[]; fixed?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const high = hits.filter((h) => h.severity === "high").length;
  const groups = groupHits(hits);
  const clean = hits.length === 0;
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
          clean ? "bg-ok-soft text-ok" : high ? "bg-warn-soft text-warn" : "bg-secondary text-muted-foreground",
        )}
      >
        <ShieldCheck className="size-3.5" />
        {clean ? "Reads human" : `${hits.length} AI pattern${hits.length === 1 ? "" : "s"}`}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute top-9 right-0 z-30 w-80 origin-top-right rounded-2xl border bg-popover p-4 text-sm shadow-[var(--shadow-lift)]"
          >
            <p className="font-semibold">Human check</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Every line is scanned for the patterns in the no-ai-slop guide: AI words, em dashes, &quot;it&apos;s not X, it&apos;s Y&quot;, made-up details and more.
              {fixed ? ` ${fixed} line${fixed === 1 ? " was" : "s were"} rewritten automatically when this was written.` : ""}
            </p>
            {clean ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ok">
                <Check className="size-3.5" /> No AI patterns found
              </p>
            ) : (
              <ul className="mt-3 flex max-h-64 flex-col gap-2.5 overflow-y-auto">
                {groups.map((g) => (
                  <li key={g.id} className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold">
                      {g.label}
                      {g.severity === "soft" && <span className="ml-1.5 font-normal text-muted-foreground">minor</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {g.matches.slice(0, 4).map((m) => `“${m}”`).join(", ")} · {g.fix}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Chip({ children, tone = "muted", className }: { children: ReactNode; tone?: "muted" | "ink" | "pink" | "ok" | "warn"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[0.72rem] font-medium whitespace-nowrap",
        tone === "ink" && "bg-foreground text-background",
        tone === "muted" && "bg-secondary text-secondary-foreground",
        tone === "pink" && "bg-pink-soft text-pink-ink",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        className,
      )}
    >
      {children}
    </span>
  );
}
