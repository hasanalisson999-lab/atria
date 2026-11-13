"use client";

import { Bookmark, BookmarkCheck, Check, Loader2, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { createBoard, listBoardsForAd, toggleSaved, type BoardOption } from "@/app/actions";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = { pink: "bg-pink", lime: "bg-lime", sky: "bg-sky-400", amber: "bg-amber-400", violet: "bg-violet-400", slate: "bg-slate-400" };

/** "Save" button with a board picker: tick boards, or type a name to create one and save in one go. */
export function SaveButton({ adId, variant = "solid", align = "right" }: { adId: string; variant?: "solid" | "overlay" | "icon"; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardOption[] | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const savedAnywhere = boards?.some((b) => b.saved) ?? false;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listBoardsForAd(adId).then((r) => alive && (r.ok ? setBoards(r.boards) : toast.error(r.error)));
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node) && setOpen(false);
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      alive = false;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, adId]);

  const toggle = (b: BoardOption) =>
    start(async () => {
      setBoards((list) => list?.map((x) => (x.id === b.id ? { ...x, saved: !b.saved, items: x.items + (b.saved ? -1 : 1) } : x)) ?? null);
      const r = await toggleSaved(b.id, adId, !b.saved);
      if (r.ok) toast.success(b.saved ? `Removed from ${b.name}` : `Saved to ${b.name}`);
      else toast.error(r.error);
    });

  const create = () =>
    start(async () => {
      const r = await createBoard(name, adId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Saved to ${name.trim()}`);
      setName("");
      const fresh = await listBoardsForAd(adId);
      if (fresh.ok) setBoards(fresh.boards);
    });

  return (
    <div ref={ref} className="relative z-[5]" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 8, left: align === "right" ? Math.max(8, r.right - 256) : Math.min(window.innerWidth - 264, r.left) });
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={variant === "icon" ? (savedAnywhere ? "Saved to a board" : "Save to a board") : undefined}
        title={variant === "icon" ? "Save to a board" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold transition-[background-color,box-shadow,transform] duration-200 active:scale-95",
          variant === "overlay"
            ? "h-8 bg-white px-3 text-xs text-[#0a0a0b] shadow-lg hover:bg-white/90"
            : variant === "icon"
              ? "size-7 justify-center border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground"
              : "h-11 border bg-card px-4 text-sm hover:border-foreground/25 hover:shadow-[var(--shadow-card)]",
        )}
      >
        {savedAnywhere ? <BookmarkCheck className={cn(variant === "icon" ? "size-3.5" : "size-4", "text-pink-ink dark:text-pink")} /> : <Bookmark className={variant === "icon" ? "size-3.5" : "size-4"} />}
        {variant !== "icon" && (savedAnywhere ? "Saved" : "Save")}
      </button>
      {typeof document !== "undefined" &&
        createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="z-[70] w-64 overflow-hidden rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-2xl"
          >
            <p className="eyebrow px-2 pt-1 pb-2">Save to board</p>
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {boards === null ? (
                <span className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Loading boards…
                </span>
              ) : boards.length === 0 ? (
                <span className="px-2 py-2 text-sm text-muted-foreground">No boards yet. Create one below.</span>
              ) : (
                boards.map((b) => (
                  <button key={b.id} onClick={() => toggle(b)} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-secondary">
                    <span className={cn("size-2.5 rounded-full", DOT[b.color] ?? "bg-pink")} />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="font-mono text-[0.65rem] text-muted-foreground">{b.items}</span>
                    <span className={cn("grid size-5 place-items-center rounded-md border transition-colors", b.saved && "border-transparent bg-ink text-ink-foreground")}>
                      {b.saved && <Check className="size-3" />}
                    </span>
                  </button>
                ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) create();
              }}
              className="mt-1 flex items-center gap-1 border-t p-1 pt-2"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New board name…"
                maxLength={60}
                className="h-9 min-w-0 flex-1 rounded-lg bg-surface px-2.5 text-sm outline-none focus:ring-2 focus:ring-pink/40"
              />
              <button disabled={!name.trim() || pending} className="grid size-9 place-items-center rounded-lg bg-ink text-ink-foreground disabled:opacity-40" aria-label="Create board">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
