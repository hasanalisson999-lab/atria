"use client";

import {
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  FolderInput,
  Link2,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  generateBoardBrief,
  type BoardBrief as Brief,
} from "@/app/board-actions";
import type { Citation } from "@/app/studio-actions";
import { useAdPanel } from "@/components/ad/ad-panel";
import { Answer } from "@/components/ai/answer";
import { BrandAvatar } from "@/components/brand-avatar";
import { AdGrid, useMasonryColumns } from "@/components/feed/ad-grid";
import { AdTile } from "@/components/feed/ad-tile";
import { EditableText } from "@/components/lab/lab-doc";
import type { FeedAd } from "@/lib/server/ads";
import type { BoardDetail, BoardSummary } from "@/lib/server/boards";
import { useUrlState } from "@/lib/url-state";
import { sized } from "@/lib/media";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const COLORS = ["pink", "lime", "sky", "amber", "violet", "slate"] as const;
const DOT: Record<string, string> = {
  pink: "bg-pink",
  lime: "bg-lime",
  sky: "bg-sky-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  slate: "bg-slate-400",
};
const TEMPLATES = [
  { name: "Hooks to steal", hint: "Openers worth testing" },
  { name: "UGC references", hint: "Creator-style ads" },
  { name: "Product demos", hint: "Show, don't tell" },
  { name: "Offers & promos", hint: "Discounts and urgency" },
  { name: "Evergreen winners", hint: "Ads running 90+ days" },
  { name: "Launch ideas", hint: "For your first drop" },
];

const ago = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0
    ? "today"
    : d === 1
      ? "yesterday"
      : d < 30
        ? `${d} days ago`
        : new Date(iso).toLocaleDateString("en", {
            month: "short",
            day: "numeric",
          });
};
const fmtName = (f: string) =>
  f === "dco" ? "Dynamic" : f.charAt(0).toUpperCase() + f.slice(1);

async function api<T = { ok: true }>(
  url: string,
  method: string,
  body?: unknown,
): Promise<(T & { ok: true }) | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as
      (T & { ok: true }) | { ok: false; error: string };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

// ------------------------------------------------------------------ app

export interface BoardsCurrent {
  board: BoardDetail;
  ads: FeedAd[];
}

/** Boards: a quiet rail of every board on the left, and the overview or one board on the right. */
export function BoardsApp({
  boards,
  current,
  recent,
}: {
  boards: BoardSummary[];
  current: BoardsCurrent | null;
  recent: FeedAd[];
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12">
      <Rail boards={boards} currentId={current?.board.id ?? null} />
      <div className="min-w-0">
        <motion.div
          key={current?.board.id ?? "all"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          {current ? (
            <BoardView
              key={current.board.id}
              current={current}
              boards={boards}
            />
          ) : (
            <Overview boards={boards} recent={recent} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function useCreate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const create = async (name: string, adIds?: string[]) => {
    if (!name.trim() || busy) return null;
    setBusy(true);
    const r = await api<{ id: string }>("/api/boards", "POST", { name, adIds });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    router.push(`/boards/${r.id}`);
    router.refresh();
    return r.id;
  };
  return { create, busy };
}

function Rail({
  boards,
  currentId,
}: {
  boards: BoardSummary[];
  currentId: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const { create, busy } = useCreate();
  const saved = boards.reduce((n, b) => n + b.items, 0);
  return (
    <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6.5rem)]">
      <nav aria-label="Boards" className="flex h-full flex-col gap-4">
        <Link
          href="/boards"
          aria-current={!currentId ? "page" : undefined}
          className={cn(
            "flex h-9 items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors",
            !currentId
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          All boards{" "}
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {saved}
          </span>
        </Link>
        <span className="px-3 text-[0.68rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          Boards · {boards.length}
        </span>
        <ol className="no-scrollbar -mx-1 -mt-2 flex gap-1 overflow-x-auto px-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-px lg:overflow-y-auto">
          {boards.map((b) => {
            const on = b.id === currentId;
            return (
              <li key={b.id} className="shrink-0">
                <Link
                  href={`/boards/${b.id}`}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
                    on
                      ? "bg-secondary font-semibold text-foreground"
                      : "text-foreground/80 hover:bg-secondary/60",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      DOT[b.color] ?? DOT.pink,
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {b.items}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        {adding ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await create(name)) {
                setName("");
                setAdding(false);
              }
            }}
            className="flex items-center gap-1 rounded-lg border bg-card px-2 focus-within:border-foreground/25"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              onBlur={() => !name.trim() && setAdding(false)}
              maxLength={60}
              placeholder="Board name"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {busy ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-[0.7rem] text-muted-foreground">Enter</span>
            )}
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <Plus className="size-4" /> New board
          </button>
        )}
      </nav>
    </aside>
  );
}

// ------------------------------------------------------------------ shared

function Section({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-5 border-t pt-8", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small popover anchored under its trigger; closes on outside click or Esc. */
function Popover({
  trigger,
  children,
  align = "left",
  up = false,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: up ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: up ? 4 : -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute z-40 min-w-56 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-[var(--shadow-lift)]",
              align === "right" ? "right-0" : "left-0",
              up ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+6px)]",
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ overview

function Cover({ b }: { b: BoardSummary }) {
  const c = b.covers.slice(0, 3);
  return (
    <div className="grid aspect-[4/3] grid-cols-3 grid-rows-2 gap-1 overflow-hidden rounded-xl bg-secondary">
      {c.length === 0 ? (
        <span className="col-span-3 row-span-2 grid place-items-center text-sm text-muted-foreground">
          Empty board
        </span>
      ) : (
        c.map((src, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={sized(src, 640)}
            onError={(e) => e.currentTarget.src !== src && (e.currentTarget.src = src)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className={cn(
              "size-full object-cover transition-transform duration-500 ease-[var(--ease-out-quart)] group-hover/b:scale-[1.03]",
              k === 0 &&
                (c.length === 1
                  ? "col-span-3 row-span-2"
                  : "col-span-2 row-span-2"),
              c.length === 2 && k === 1 && "row-span-2",
            )}
          />
        ))
      )}
    </div>
  );
}

function Overview({
  boards,
  recent,
}: {
  boards: BoardSummary[];
  recent: FeedAd[];
}) {
  const { create, busy } = useCreate();
  const saved = boards.reduce((n, b) => n + b.items, 0);
  const have = new Set(boards.map((b) => b.name.toLowerCase()));
  const templates = TEMPLATES.filter((t) => !have.has(t.name.toLowerCase()));

  if (!boards.length)
    return (
      <div className="flex flex-col gap-12">
        <header className="flex max-w-2xl flex-col gap-4">
          <span className="text-[0.78rem] font-medium text-muted-foreground">
            Boards
          </span>
          <h1 className="text-[2.3rem] leading-[1.1] font-semibold tracking-[-0.035em] text-balance sm:text-[2.9rem]">
            Collect the ads worth stealing.{" "}
            <span className="text-muted-foreground">
              Then let AI tell you why they work.
            </span>
          </h1>
        </header>
        <ol className="grid border-y sm:grid-cols-3">
          {[
            [
              "Save",
              "Press Save on any ad in Discover, Tracking or a brand page and pick a board.",
            ],
            [
              "Sort",
              "Add notes, move ads between boards, and filter by brand or format.",
            ],
            [
              "Learn",
              "Each board gets an AI read: what the ads share and three concepts for your brand.",
            ],
          ].map(([t, d], i) => (
            <li
              key={t}
              className={cn(
                "flex flex-col gap-1.5 py-6",
                i > 0 && "sm:border-l sm:pl-6",
                i > 0 && "max-sm:border-t",
              )}
            >
              <span className="text-xs text-muted-foreground tabular-nums">
                0{i + 1}
              </span>
              <span className="font-semibold">{t}</span>
              <span className="text-sm text-muted-foreground">{d}</span>
            </li>
          ))}
        </ol>
        <Section
          title="Start with a board"
          hint="One click creates it. You can rename it any time."
          className="border-t-0 pt-0"
        >
          <Templates
            list={templates}
            onPick={(n) => void create(n)}
            busy={busy}
          />
        </Section>
      </div>
    );

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-3">
        <span className="text-[0.78rem] font-medium text-muted-foreground">
          Boards
        </span>
        <h1 className="text-[2.3rem] leading-[1.1] font-semibold tracking-[-0.035em] sm:text-[2.6rem]">
          {saved} saved ad{saved === 1 ? "" : "s"}{" "}
          <span className="text-muted-foreground">
            across {boards.length} board{boards.length === 1 ? "" : "s"}.
          </span>
        </h1>
      </header>

      <ul className="grid gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
        {boards.map((b, i) => (
          <motion.li
            key={b.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: Math.min(i, 8) * 0.04,
              duration: 0.4,
              ease: EASE,
            }}
          >
            <Link
              href={`/boards/${b.id}`}
              className="group/b flex flex-col gap-3"
            >
              <Cover b={b} />
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-semibold">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        DOT[b.color] ?? DOT.pink,
                      )}
                    />
                    <span className="truncate group-hover/b:underline">
                      {b.name}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {b.items} ad{b.items === 1 ? "" : "s"}
                    {b.brands
                      ? ` · ${b.brands} brand${b.brands === 1 ? "" : "s"}`
                      : ""}{" "}
                    · {ago(b.updated_at)}
                  </span>
                </div>
                {b.logos.length > 0 && (
                  <span className="flex -space-x-1.5 pt-0.5">
                    {b.logos.slice(0, 3).map((l) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={l}
                        src={l}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="size-6 rounded-full bg-card object-cover ring-2 ring-background"
                      />
                    ))}
                  </span>
                )}
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>

      {recent.length > 0 && (
        <Section
          title="Recently saved"
          hint="The latest ads you saved, across every board"
        >
          <AdGrid ads={recent} />
        </Section>
      )}

      {templates.length > 0 && (
        <Section title="More boards to start" hint="One click creates it">
          <Templates
            list={templates}
            onPick={(n) => void create(n)}
            busy={busy}
          />
        </Section>
      )}
    </div>
  );
}

function Templates({
  list,
  onPick,
  busy,
}: {
  list: typeof TEMPLATES;
  onPick: (name: string) => void;
  busy: boolean;
}) {
  return (
    <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((t) => (
        <li key={t.name}>
          <button
            disabled={busy}
            onClick={() => onPick(t.name)}
            className="group/t flex w-full items-center gap-3 border-b py-3 text-left disabled:opacity-50"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover/t:bg-foreground group-hover/t:text-background">
              <Plus className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ one board

const SORTS = [
  { id: "saved", label: "Recently saved" },
  { id: "longest", label: "Longest running" },
  { id: "brand", label: "Brand A–Z" },
] as const;

function BoardView({
  current,
  boards,
}: {
  current: BoardsCurrent;
  boards: BoardSummary[];
}) {
  const router = useRouter();
  const { board } = current;
  const [tab, setTab] = useUrlState<"ads" | "insights">("tab", "ads", [
    "ads",
    "insights",
  ]);
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [color, setColor] = useState(board.color);
  const [ads, setAds] = useState(current.ads);
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      board.items.filter((i) => i.note).map((i) => [i.ad_id, i.note!]),
    ),
  );
  const [confirmDel, setConfirmDel] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const others = boards.filter((b) => b.id !== board.id);
  const brands = new Set(ads.map((a) => a.brand_id).filter(Boolean)).size;

  const patch = async (body: Record<string, unknown>) => {
    const r = await api(`/api/boards/${board.id}`, "PATCH", body);
    if (!r.ok) toast.error(r.error);
    else router.refresh();
    return r.ok;
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <Popover
                trigger={(open, toggle) => (
                  <button
                    onClick={toggle}
                    aria-label="Board colour"
                    title="Board colour"
                    className={cn(
                      "size-3.5 shrink-0 rounded-full ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-border",
                      DOT[color] ?? DOT.pink,
                      open && "ring-2 ring-border",
                    )}
                  />
                )}
              >
                {(close) => (
                  <div className="flex gap-2 p-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        aria-label={c}
                        onClick={() => {
                          setColor(c);
                          close();
                          void patch({ color: c });
                        }}
                        className={cn(
                          "grid size-7 place-items-center rounded-full",
                          DOT[c],
                        )}
                      >
                        {c === color && (
                          <Check className="size-3.5 text-black/70" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
              <span className="text-[0.78rem] font-medium text-muted-foreground">
                {ads.length} ad{ads.length === 1 ? "" : "s"}
                {brands ? ` · ${brands} brand${brands === 1 ? "" : "s"}` : ""} ·
                updated {ago(board.updated_at)}
              </span>
            </div>
            <EditableText
              label="board name"
              singleLine
              value={name}
              onSave={async (v) => {
                if (!v) return;
                const prev = name;
                setName(v);
                if (!(await patch({ name: v }))) setName(prev);
              }}
              className="text-[2.1rem] leading-tight font-semibold tracking-[-0.03em] sm:text-[2.5rem]"
            />
            <EditableText
              label="description"
              value={description}
              placeholder="Add a description: what this board is for"
              onSave={(v) => {
                setDescription(v);
                void patch({ description: v });
              }}
              className="max-w-2xl text-[0.98rem] text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(
                  window.location.href.split("?")[0]!,
                );
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 1400);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {linkCopied ? (
                <Check className="size-4 text-ok" />
              ) : (
                <Link2 className="size-4" />
              )}{" "}
              {linkCopied ? "Copied" : "Copy link"}
            </button>
            <button
              onClick={async () => {
                if (!confirmDel) {
                  setConfirmDel(true);
                  setTimeout(() => setConfirmDel(false), 3000);
                  return;
                }
                const r = await api(`/api/boards/${board.id}`, "DELETE");
                if (!r.ok) return void toast.error(r.error);
                toast.success(`Deleted ${name}`);
                router.push("/boards");
                router.refresh();
              }}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors",
                confirmDel
                  ? "bg-destructive text-white"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
              aria-label="Delete board"
            >
              <Trash className="size-4" /> {confirmDel ? "Delete board?" : ""}
            </button>
          </div>
        </div>

        <div role="tablist" className="flex gap-6 border-b">
          {(
            [
              ["ads", `Ads ${ads.length}`],
              ["insights", "Insights"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "relative -mb-px pb-3 text-sm font-medium transition-colors",
                tab === id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {tab === id && (
                <motion.span
                  layoutId="board-tab"
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          ))}
        </div>
      </header>

      {tab === "ads" ? (
        <AdsTab
          boardId={board.id}
          items={board.items}
          ads={ads}
          setAds={setAds}
          notes={notes}
          setNotes={setNotes}
          others={others}
        />
      ) : (
        <Insights board={board} ads={ads} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ads tab

function AdsTab({
  boardId,
  items,
  ads,
  setAds,
  notes,
  setNotes,
  others,
}: {
  boardId: string;
  items: BoardDetail["items"];
  ads: FeedAd[];
  setAds: (f: (a: FeedAd[]) => FeedAd[]) => void;
  notes: Record<string, string>;
  setNotes: (f: (n: Record<string, string>) => Record<string, string>) => void;
  others: BoardSummary[];
}) {
  const router = useRouter();
  const panel = useAdPanel();
  const cols = useMasonryColumns();
  const [q, setQ] = useUrlState<string>("q", "");
  const [brand, setBrand] = useUrlState<string>("brand", "all");
  const [format, setFormat] = useUrlState<string>("format", "all", [
    "all",
    "video",
    "image",
    "carousel",
    "dco",
  ]);
  const [sort, setSort] = useUrlState<(typeof SORTS)[number]["id"]>(
    "sort",
    "saved",
    SORTS.map((s) => s.id),
  );
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const savedAt = new Map(items.map((i, k) => [i.ad_id, k]));
  const brandList = [
    ...new Map(
      ads
        .filter((a) => a.brand_id)
        .map((a) => [
          a.brand_id!,
          {
            id: a.brand_id!,
            name: a.brand_name ?? "Brand",
            logo: a.brand_logo,
            small: a.brand_logo_small,
          },
        ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const formats = [...new Set(ads.map((a) => a.format))].filter((f) =>
    ["video", "image", "carousel", "dco"].includes(f),
  );
  const needle = q.trim().toLowerCase();
  const shown = ads
    .filter(
      (a) =>
        (brand === "all" || a.brand_id === brand) &&
        (format === "all" || a.format === format),
    )
    .filter(
      (a) =>
        !needle ||
        [a.brand_name, a.headline, a.body_text, a.cta, notes[a.id]].some((t) =>
          t?.toLowerCase().includes(needle),
        ),
    )
    .sort((a, b) =>
      sort === "longest"
        ? (b.days_running ?? 0) - (a.days_running ?? 0)
        : sort === "brand"
          ? (a.brand_name ?? "").localeCompare(b.brand_name ?? "")
          : (savedAt.get(a.id) ?? 0) - (savedAt.get(b.id) ?? 0),
    );
  const filtered = brand !== "all" || format !== "all" || !!needle;

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  const bulk = async (
    action: "remove" | "move" | "copy",
    to?: { id: string; name: string },
  ) => {
    const ids = [...picked];
    if (!ids.length) return;
    setBusy(action);
    const r = await api<{ changed: number }>(
      `/api/boards/${boardId}/items`,
      "POST",
      { action, adIds: ids, to: to?.id },
    );
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    if (action !== "copy")
      setAds((list) => list.filter((a) => !picked.has(a.id)));
    toast.success(
      action === "remove"
        ? `Removed ${ids.length} ad${ids.length === 1 ? "" : "s"}`
        : `${action === "move" ? "Moved" : "Copied"} ${ids.length} to ${to?.name}`,
    );
    stopSelecting();
    router.refresh();
  };
  const bulkToNew = async (action: "move" | "copy", name: string) => {
    const ids = [...picked];
    const r = await api<{ id: string }>("/api/boards", "POST", {
      name,
      adIds: ids,
    });
    if (!r.ok) return void toast.error(r.error);
    if (action === "move") {
      const rm = await api(`/api/boards/${boardId}/items`, "POST", {
        action: "remove",
        adIds: ids,
      });
      if (!rm.ok) return void toast.error(rm.error);
      setAds((list) => list.filter((a) => !ids.includes(a.id)));
    }
    toast.success(
      `${action === "move" ? "Moved" : "Copied"} ${ids.length} to ${name}`,
    );
    stopSelecting();
    router.refresh();
  };

  const saveNote = async (adId: string, note: string) => {
    setNotes((n) => ({ ...n, [adId]: note }));
    const r = await api(`/api/boards/${boardId}/items`, "POST", {
      action: "note",
      adId,
      note,
    });
    if (!r.ok) toast.error(r.error);
  };

  if (!ads.length)
    return (
      <div className="flex flex-col items-start gap-4 border-y py-12">
        <p className="text-[1.15rem] font-semibold">This board is empty</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Press Save on any ad in Discover, Tracking or a brand page and tick
          this board. It shows up here straight away.
        </p>
        <div className="flex gap-2">
          <Link
            href="/discover"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Browse Discover
          </Link>
          <Link
            href="/tracking"
            className="rounded-full border px-4 py-2 text-sm font-medium"
          >
            Competitors&apos; latest ads
          </Link>
        </div>
      </div>
    );

  const columns: { ad: FeedAd; i: number }[][] = Array.from(
    { length: cols },
    () => [],
  );
  shown.forEach((ad, i) => columns[i % cols]!.push({ ad, i }));

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-full border bg-card px-3.5 focus-within:border-foreground/25 sm:max-w-xs">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this board"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {brandList.length > 1 && (
          <Popover
            trigger={(open, toggle) => (
              <button
                onClick={toggle}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                  brand !== "all"
                    ? "border-foreground/25 bg-secondary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {brand === "all"
                  ? "All brands"
                  : (brandList.find((b) => b.id === brand)?.name ?? "Brand")}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
            )}
          >
            {(close) => (
              <ul className="no-scrollbar max-h-72 overflow-y-auto">
                {[
                  { id: "all", name: "All brands", logo: null, small: null },
                  ...brandList,
                ].map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => {
                        setBrand(b.id);
                        close();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary"
                    >
                      {b.id !== "all" && (
                        <BrandAvatar
                          name={b.name}
                          src={b.logo}
                          fallbackSrc={b.small}
                          className="size-5"
                        />
                      )}
                      <span className="flex-1 truncate">{b.name}</span>
                      {brand === b.id && <Check className="size-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
        )}
        {formats.length > 1 && (
          <div className="inline-flex h-9 items-center rounded-full bg-secondary p-0.5">
            {["all", ...formats].map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  "relative h-8 rounded-full px-3 text-[0.8rem] font-medium transition-colors",
                  format === f
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {format === f && (
                  <motion.span
                    layoutId="board-format"
                    className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">
                  {f === "all" ? "All" : fmtName(f)}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Popover
            align="right"
            trigger={(open, toggle) => (
              <button
                onClick={toggle}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {SORTS.find((s) => s.id === sort)!.label}{" "}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
            )}
          >
            {(close) =>
              SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSort(s.id);
                    close();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary"
                >
                  {s.label} {sort === s.id && <Check className="size-4" />}
                </button>
              ))
            }
          </Popover>
          <button
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              selecting
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-secondary",
            )}
          >
            <CheckSquare className="size-4" /> {selecting ? "Done" : "Select"}
          </button>
        </div>
      </div>

      {filtered && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {shown.length} of {ads.length} ads ·{" "}
          <button
            onClick={() => {
              setQ("");
              setBrand("all");
              setFormat("all");
            }}
            className="font-medium text-foreground hover:underline"
          >
            Clear filters
          </button>
        </p>
      )}

      {shown.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          No ads match. Try another search or filter.
        </p>
      ) : (
        <div className="flex items-start gap-3 sm:gap-4">
          {columns.map((col, c) => (
            <div key={c} className="flex min-w-0 flex-1 flex-col gap-6">
              {col.map(({ ad, i }) => {
                const on = picked.has(ad.id);
                return (
                  <div key={ad.id} className="flex flex-col gap-2">
                    <div
                      className={cn(
                        "relative rounded-[18px] transition-[box-shadow,transform]",
                        selecting && "cursor-pointer",
                        on &&
                          "shadow-[0_0_0_3px_var(--background),0_0_0_5px_var(--foreground)]",
                      )}
                    >
                      <AdTile
                        ad={ad}
                        index={i}
                        onOpen={(id) =>
                          selecting
                            ? togglePick(id)
                            : panel.open(
                                id,
                                shown.map((x) => ({
                                  id: x.id,
                                  thumbnail_url: x.thumbnail_url,
                                })),
                              )
                        }
                        selected={ad.id === panel.openId}
                      />
                      {selecting && (
                        <button
                          onClick={() => togglePick(ad.id)}
                          aria-label={on ? "Unselect" : "Select"}
                          aria-pressed={on}
                          className="absolute inset-0 z-10 rounded-[18px] bg-transparent"
                        >
                          <span
                            className={cn(
                              "absolute top-3 right-3 grid size-6 place-items-center rounded-full border-2 transition-colors",
                              on
                                ? "border-foreground bg-foreground text-background"
                                : "border-white bg-black/30",
                            )}
                          >
                            {on && <Check className="size-3.5" />}
                          </span>
                        </button>
                      )}
                    </div>
                    <EditableText
                      label="note"
                      value={notes[ad.id] ?? ""}
                      placeholder="Add a note"
                      onSave={(v) => void saveNote(ad.id, v)}
                      className={cn(
                        "text-[0.84rem] leading-relaxed",
                        notes[ad.id]
                          ? "text-foreground/80"
                          : "text-muted-foreground/50",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions: a floating dark bar, like the Brand Lab's Index pill. Portalled: animated ancestors trap position:fixed. */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {selecting && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#111113] p-1.5 pl-5 text-sm text-white shadow-[0_18px_40px_-12px_rgb(0_0_0/0.5)] ring-1 ring-white/10"
              >
                <span className="pr-2 font-medium tabular-nums">
                  {picked.size
                    ? `${picked.size} selected`
                    : "Tap ads to select"}
                </span>
                <button
                  onClick={() => setPicked(new Set(shown.map((a) => a.id)))}
                  className="h-9 rounded-full px-3 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  All
                </button>
                {(["move", "copy"] as const).map((action) => (
                  <Popover
                    key={action}
                    up
                    align="right"
                    trigger={(_open, toggle) => (
                      <button
                        disabled={!picked.size || !!busy}
                        onClick={toggle}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-white/90 hover:bg-white/10 disabled:opacity-40"
                      >
                        {busy === action ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : action === "move" ? (
                          <FolderInput className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {action === "move" ? "Move to" : "Copy to"}
                      </button>
                    )}
                  >
                    {(close) => (
                      <BoardPicker
                        others={others}
                        onPick={(b) => (close(), void bulk(action, b))}
                        onCreate={(n) => (close(), void bulkToNew(action, n))}
                      />
                    )}
                  </Popover>
                ))}
                <button
                  disabled={!picked.size || !!busy}
                  onClick={() => void bulk("remove")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-white/90 hover:bg-white/10 disabled:opacity-40"
                >
                  {busy === "remove" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash className="size-4" />
                  )}{" "}
                  Remove
                </button>
                <button
                  onClick={stopSelecting}
                  aria-label="Stop selecting"
                  className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function BoardPicker({
  others,
  onPick,
  onCreate,
}: {
  others: BoardSummary[];
  onPick: (b: { id: string; name: string }) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="flex w-64 flex-col">
      <ul className="no-scrollbar max-h-60 overflow-y-auto">
        {others.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => onPick(b)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  DOT[b.color] ?? DOT.pink,
                )}
              />
              <span className="flex-1 truncate">{b.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {b.items}
              </span>
            </button>
          </li>
        ))}
        {!others.length && (
          <li className="px-2.5 py-2 text-sm text-muted-foreground">
            No other boards yet.
          </li>
        )}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
        className="mt-1 flex items-center gap-2 border-t px-2.5 pt-2"
      >
        <Plus className="size-4 text-muted-foreground" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New board"
          maxLength={60}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ insights tab

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; n: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold">{title}</span>
      {rows.length ? (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <li
              key={r.label}
              className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_28px] items-center gap-3 text-sm"
            >
              <span className="truncate capitalize">{r.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.n / max) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: EASE }}
                  className="block h-full rounded-full bg-foreground/70"
                />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {r.n}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-muted-foreground">Nothing yet</span>
      )}
    </div>
  );
}

function Insights({ board, ads }: { board: BoardDetail; ads: FeedAd[] }) {
  const ins = board.insights;
  const [brief, setBrief] = useState<Brief | null>(board.ai_brief);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const byId = new Map(ads.map((a) => [a.id, a]));
  const citations: Citation[] = (brief?.ids ?? []).map((id, i) => {
    const a = byId.get(id);
    return {
      ref: `A${i + 1}`,
      id,
      brand: a?.brand_name ?? "Ad",
      thumbnail_url: a?.thumbnail_url ?? null,
      headline: a?.headline ?? null,
      days: a?.days_running ?? null,
    };
  });
  const run = async () => {
    setBusy(true);
    const r = await generateBoardBrief(board.id);
    setBusy(false);
    if (r.ok) setBrief(r.brief);
    else toast.error(r.error);
  };

  return (
    <div className="flex flex-col gap-12">
      <dl className="grid grid-cols-2 border-y sm:grid-cols-4">
        {[
          { label: "Ads saved", value: ads.length },
          { label: "Brands", value: ins.brands.length },
          { label: "Avg. days running", value: ins.avgDays },
          { label: "Hooks found", value: ins.hooks.length },
        ].map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "flex flex-col gap-1.5 py-5",
              i % 2 === 1 && "pl-5 max-sm:border-l",
              i > 0 && "sm:border-l sm:pl-6",
              i >= 2 && "max-sm:border-t",
            )}
          >
            <dt className="text-[0.8rem] text-muted-foreground">{s.label}</dt>
            <dd className="text-[1.9rem] leading-none font-semibold tracking-[-0.03em] tabular-nums">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="flex items-center gap-2 text-[1.05rem] font-semibold tracking-[-0.01em]">
              <Sparkles className="size-4 text-pink-ink dark:text-pink" /> AI
              read of this board
            </h2>
            <p className="text-sm text-muted-foreground">
              {brief
                ? `Written ${ago(brief.at)} from ${brief.ids.length} ads. Click a [ref] to open that ad.`
                : "What these ads share, patterns worth stealing, and three concepts for your brand."}
            </p>
          </div>
          <button
            onClick={() => void run()}
            disabled={busy || ads.length < 2}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity disabled:opacity-40"
            title={ads.length < 2 ? "Save at least 2 ads first" : undefined}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}{" "}
            {busy ? "Reading the board…" : brief ? "Rewrite" : "Write it"}
          </button>
        </div>
        {busy && !brief ? (
          <div className="flex flex-col gap-3">
            <div className="skeleton-shimmer h-5 w-1/2 rounded-md" />
            <div className="skeleton-shimmer h-4 w-full rounded-md" />
            <div className="skeleton-shimmer h-4 w-5/6 rounded-md" />
            <div className="skeleton-shimmer h-4 w-2/3 rounded-md" />
          </div>
        ) : brief ? (
          <div
            className={cn("max-w-3xl transition-opacity", busy && "opacity-50")}
          >
            <Answer text={brief.text} citations={citations} />
          </div>
        ) : (
          <p className="border-y py-8 text-sm text-muted-foreground">
            {ads.length < 2
              ? "Save at least 2 ads to this board, then press Write it."
              : "Press Write it. It takes about 10 seconds and uses the free AI."}
          </p>
        )}
      </section>

      <section className="grid gap-10 border-t pt-8 md:grid-cols-3">
        <Breakdown title="Brands" rows={ins.brands} />
        <Breakdown title="Formats" rows={ins.formats} />
        <Breakdown title="Calls to action" rows={ins.ctas} />
      </section>

      <section className="flex flex-col gap-4 border-t pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em]">
              Hooks on this board
            </h2>
            <p className="text-sm text-muted-foreground">
              The opening line of each ad
              {ins.analyzed < ads.length
                ? `. Open an ad for its AI-detected hook (${ins.analyzed} of ${ads.length} done).`
                : "."}
            </p>
          </div>
          {ins.hooks.length > 0 && (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(
                  ins.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n"),
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3.5 text-ok" />
              ) : (
                <Copy className="size-3.5" />
              )}{" "}
              {copied ? "Copied" : "Copy all"}
            </button>
          )}
        </div>
        {ins.hooks.length ? (
          <ol className="flex flex-col">
            {ins.hooks.map((h, i) => (
              <li
                key={h}
                className="flex gap-4 border-b py-3 text-[0.98rem] last:border-b-0"
              >
                <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">{h}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No hooks yet.</p>
        )}
      </section>
    </div>
  );
}
