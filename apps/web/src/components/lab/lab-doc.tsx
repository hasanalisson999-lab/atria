"use client";

import { ArrowLeft, ArrowRight, Check, ChevronsUpDown, Link2, TextAlignStart } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EASE, Rich, useCopy } from "./lab-ui";

/**
 * The Brand Lab's document layout: one chapter on screen at a time (a script, "Taglines", an ad concept…),
 * a numbered title, Previous/Next at the end, and a floating dark Index pill that shows reading progress and
 * lists every chapter of the current section. Each chapter has its own URL (the parent owns that).
 */
export interface DocChapter {
  id: string;
  title: string;
  /** Small right-aligned note in the Index (e.g. the platform). */
  hint?: string;
}

export const pad = (n: number) => String(n).padStart(2, "0");

/** Shared reading column: a 64px gutter on the left holds timings, labels and the heading's link icon. */
export const gutter = "sm:pl-16";

export function DocShell({ chapters, active, onSelect, children, empty }: { chapters: DocChapter[]; active: string | null; onSelect: (id: string) => void; children: ReactNode; empty?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const index = Math.max(0, chapters.findIndex((c) => c.id === active));
  const prev = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;
  const first = useRef(true);

  // Reading progress through the chapter on screen.
  useEffect(() => {
    const onScroll = () => {
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      const p = travel > 0 ? -r.top / travel : 1;
      setProgress(Math.round(Math.min(1, Math.max(0, p)) * 100));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [active]);

  // A new chapter starts at its title, not halfway down the previous one's scroll position.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = root.current;
    if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 88, behavior: "instant" });
  }, [active]);

  // [ and ] move between chapters (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "]" && next) onSelect(next.id);
      if (e.key === "[" && prev) onSelect(prev.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onSelect]);

  if (!chapters.length) return <>{empty}</>;
  return (
    <div ref={root} className="relative flex min-h-[calc(100dvh-10rem)] flex-col">
      <motion.div key={active ?? ""} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}>
        {children}
      </motion.div>

      {(prev || next) && (
        <nav aria-label="Chapters" className={cn("mt-16 grid grid-cols-2 gap-3 border-t pt-6", gutter)}>
          {prev ? (
            <button onClick={() => onSelect(prev.id)} className="group/p flex min-w-0 flex-col items-start gap-1 rounded-2xl p-3 -ml-3 text-left transition-colors hover:bg-secondary/70">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="size-3.5 transition-transform group-hover/p:-translate-x-0.5" /> Previous
              </span>
              <span className="w-full truncate text-[0.95rem] font-medium">
                {pad(index)}. {prev.title}
              </span>
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button onClick={() => onSelect(next.id)} className="group/n flex min-w-0 flex-col items-end gap-1 rounded-2xl p-3 -mr-3 text-right transition-colors hover:bg-secondary/70">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                Next <ArrowRight className="size-3.5 transition-transform group-hover/n:translate-x-0.5" />
              </span>
              <span className="w-full truncate text-[0.95rem] font-medium">
                {pad(index + 2)}. {next.title}
              </span>
            </button>
          ) : (
            <span />
          )}
        </nav>
      )}

      <div className={cn("sticky bottom-6 z-30 mt-auto w-fit pt-10", gutter)}>
        <IndexPill chapters={chapters} active={chapters[index]?.id ?? null} progress={progress} onJump={onSelect} />
      </div>
    </div>
  );
}

function IndexPill({ chapters, active, progress, onJump }: { chapters: DocChapter[]; active: string | null; progress: number; onJump: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <motion.div
      ref={ref}
      layout
      transition={{ type: "spring", stiffness: 480, damping: 40 }}
      style={{ borderRadius: 22 }}
      className={cn("overflow-hidden bg-[#111113] text-white shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)] ring-1 ring-white/10", open ? "w-[min(460px,calc(100vw-2rem))]" : "w-[220px]")}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="list" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: EASE }}>
            <ol className="no-scrollbar max-h-[min(60vh,520px)] overflow-y-auto px-2 pt-2.5">
              {chapters.map((c, i) => {
                const on = c.id === active;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setOpen(false);
                        onJump(c.id);
                      }}
                      aria-current={on ? "true" : undefined}
                      className={cn("flex w-full items-baseline gap-2 rounded-xl px-3 py-2 text-left text-[0.92rem] transition-colors", on ? "bg-white/10 text-white" : "text-white/55 hover:text-white")}
                    >
                      <span className="shrink-0 tabular-nums">{pad(i + 1)}.</span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {c.hint && <span className="shrink-0 text-[0.7rem] text-white/35">{c.hint}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="px-5 pt-2 pb-1 text-[0.68rem] text-white/35">Press [ or ] to move between them</p>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button layout="position" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Index" className="flex h-11 w-full items-center gap-2.5 pr-1.5 pl-4 text-left">
        <TextAlignStart className="size-4 text-white/80" />
        <span className="text-[0.92rem] font-medium">Index</span>
        <ChevronsUpDown className="size-3.5 text-white/55" />
        <span className="ml-auto rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium tabular-nums">{progress}%</span>
      </motion.button>
    </motion.div>
  );
}

/** Numbered chapter title ("02. Taglines") with a link icon in the gutter on hover that copies the chapter's URL. */
export function DocTitle({ n, link, children, eyebrow }: { n: number; link: string; children: ReactNode; eyebrow?: ReactNode }) {
  const [copied, copy] = useCopy();
  return (
    <div className={cn("group/h relative flex flex-col gap-2", gutter)}>
      {eyebrow && <div className="text-[0.78rem] font-medium text-muted-foreground">{eyebrow}</div>}
      <button
        onClick={() => {
          window.history.replaceState(null, "", link);
          copy(`${window.location.origin}${link}`);
        }}
        aria-label="Copy a link to this"
        title={copied ? "Link copied" : "Copy link"}
        className={cn("absolute left-7 hidden size-7 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover/h:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 sm:grid", eyebrow ? "top-9" : "top-1.5")}
      >
        {copied ? <Check className="size-4 text-ok" /> : <Link2 className="size-4" />}
      </button>
      <h2 className="flex min-w-0 items-baseline gap-2.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2rem]">
        <span className="shrink-0 text-muted-foreground/60 tabular-nums">{pad(n)}.</span>
        <span className="min-w-0 flex-1">{children}</span>
      </h2>
    </div>
  );
}

/** A labelled block inside a chapter, sitting in the reading column with its label in the gutter. */
export function DocBlock({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-x-4 sm:grid-cols-[48px_minmax(0,1fr)]", className)}>
      <div className="hidden pt-1 text-right text-[0.66rem] leading-5 font-medium tracking-wide text-muted-foreground uppercase sm:block">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Click-to-edit text: shows the text (with [blanks] highlighted); a click turns it into a textarea with the same
 * typography. Enter or clicking away saves, Esc cancels. Read-only when no onSave is given.
 */
export function EditableText({
  value,
  onSave,
  className,
  placeholder = "Click to write",
  startEditing = false,
  singleLine = false,
  label,
}: {
  value: string;
  onSave?: (v: string) => void;
  className?: string;
  placeholder?: string;
  startEditing?: boolean;
  singleLine?: boolean;
  label: string;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const begin = () => {
    cancelled.current = false;
    setDraft(value);
    setEditing(true);
  };
  if (!onSave) return <div className={className}>{value ? <Rich text={value} /> : null}</div>;
  if (editing)
    return (
      <textarea
        autoFocus
        aria-label={label}
        value={draft}
        rows={1}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        onChange={(e) => setDraft(singleLine ? e.target.value.replace(/\n/g, " ") : e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (!cancelled.current && draft.trim() !== value.trim()) onSave(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={cn("field-sizing-content -mx-1.5 block w-[calc(100%+0.75rem)] resize-none rounded-lg bg-secondary px-1.5 ring-2 ring-ring/30 outline-none", className)}
      />
    );
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit ${label}`}
      title="Click to edit"
      onClick={(e) => {
        // Selecting text to copy shouldn't jump into edit mode.
        if (window.getSelection()?.toString()) return;
        e.stopPropagation();
        begin();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          begin();
        }
      }}
      className={cn("-mx-1.5 cursor-text rounded-lg px-1.5 transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none", className)}
    >
      {value ? <Rich text={value} /> : <span className="text-muted-foreground/50">{placeholder}</span>}
    </div>
  );
}
