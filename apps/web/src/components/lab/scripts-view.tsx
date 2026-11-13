"use client";

import { ArrowUp, Check, ChevronDown, Clapperboard, Loader2, Minus, Pause, Play, Plus, RotateCcw, Sparkles, Trash, Video, WandSparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LabEntry, Script, Scripts, ScriptStatus } from "@/lib/server/lab";
import { useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { DocShell, DocTitle, EditableText, gutter } from "./lab-doc";
import { arr, card, Chip, CopyBtn, EASE, HumanBadge, useSlop, Writing } from "./lab-ui";

const PLATFORMS = [
  { id: "TikTok", short: "TikTok" },
  { id: "Instagram Reels", short: "Reels" },
  { id: "YouTube Shorts", short: "Shorts" },
  { id: "YouTube", short: "YouTube" },
] as const;
const LENGTHS = ["15s", "30s", "60s", "3-5 min"] as const;
const FORMATS = ["Any format", "Founder story", "Build in public", "How it works", "Day in the life", "Behind the scenes", "Reply to a comment", "Problem and fix", "Myth vs fact"];
const STARTERS = [
  "I'm 17 and I'm building my own shoe brand. Here's why",
  "How the shoe is supposed to work",
  "My first prototype just arrived",
  "Replying to: why would anyone buy shoes from a 17 year old?",
  "Why I want one shoe for school, the gym and walking",
  "What building a brand at 17 looks like on a school day",
];
const STATUS: { id: ScriptStatus; label: string }[] = [
  { id: "idea", label: "To film" },
  { id: "filmed", label: "Filmed" },
  { id: "posted", label: "Posted" },
];

const shortPlatform = (p: string) => PLATFORMS.find((x) => x.id === p)?.short ?? p;
const spokenWords = (s: Script) => arr(s.lines).reduce((n, l) => n + l.say.trim().split(/\s+/).filter(Boolean).length, 0);
/** Seconds it takes to say the lines out loud at a natural 150 words per minute. */
const spokenSeconds = (s: Script) => Math.round(spokenWords(s) / 2.5);
const fmtSecs = (n: number) => (n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, "0")}s`);
const blanks = (s: Script) => new Set([s.hook, ...arr(s.lines).map((l) => `${l.say} ${l.show}`), s.caption].join(" ").match(/\[[^\]\n]{1,80}\]/g) ?? []).size;

function scriptText(s: Script) {
  return `${s.title} (${s.platform}, ${s.length})\n\n${arr(s.lines)
    .map((l) => `[${l.t}] ${l.say}${l.show ? `\n   On screen: ${l.show}` : ""}`)
    .join("\n\n")}\n\nCaption: ${s.caption}\n${arr(s.hashtags).join(" ")}`;
}

type Result = { ok: true; entry: LabEntry } | { ok: false; error: string };

async function call(url: string, method: string, body?: unknown): Promise<Result> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return (await res.json()) as Result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export function ScriptsView({
  selectedId,
  onSelect,
  entry,
  busySet,
  error,
  onNewSet,
  onEntry,
}: {
  /** Script open in the URL (/lab/scripts/<id>). */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  entry?: LabEntry;
  busySet: boolean;
  error?: string;
  onNewSet: () => void;
  onEntry: (e: LabEntry) => void;
}) {
  const list = arr((entry?.data as Scripts | undefined)?.scripts);
  const [platform, setPlatform] = useUrlState<string>("platform", "all", ["all", ...PLATFORMS.map((p) => p.id)]);
  const [status, setStatus] = useUrlState<ScriptStatus | "all">("status", "all", ["all", "idea", "filmed", "posted"]);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<Record<string, SaveState | undefined>>({});

  // Latest entry for edits made in quick succession (each edit builds on the previous one, not a stale copy).
  const latest = useRef(entry);
  useEffect(() => {
    latest.current = entry;
  }, [entry]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Partial<Script>>());

  /** Applies an edit instantly, then saves it (edits within 600ms are sent together). */
  const patchScript = useCallback(
    (id: string, patch: Partial<Script>) => {
      const cur = latest.current;
      if (!cur) return;
      const scripts = arr((cur.data as Scripts).scripts).map((s) => (s.id === id ? { ...s, ...patch } : s));
      const next = { ...cur, data: { scripts } };
      latest.current = next;
      onEntry(next);
      pending.current.set(id, { ...pending.current.get(id), ...patch });
      setSaveState((x) => ({ ...x, [id]: "saving" }));
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      timers.current.set(
        id,
        setTimeout(async () => {
          const body = pending.current.get(id);
          pending.current.delete(id);
          timers.current.delete(id);
          const r = await call(`/api/lab/script/${id}`, "PATCH", body);
          setSaveState((x) => ({ ...x, [id]: r.ok ? "saved" : "error" }));
          if (r.ok) setTimeout(() => setSaveState((x) => (x[id] === "saved" ? { ...x, [id]: undefined } : x)), 1600);
        }, 600),
      );
    },
    [onEntry],
  );

  const shown = list.filter((s) => (platform === "all" || s.platform === platform) && (status === "all" || (s.status ?? "idea") === status));
  // One script on screen at a time: the one in the URL, or the first one that matches the filters.
  const current = shown.find((s) => s.id === selectedId) ?? shown[0] ?? null;

  const compose = async (topic: string, opts: { platform: string; length: string; format: string }) => {
    setComposeBusy(true);
    setComposeError(null);
    const r = await call("/api/lab/scripts", "POST", { topic, platform: opts.platform, length: opts.length, format: opts.format === FORMATS[0] ? undefined : opts.format });
    setComposeBusy(false);
    if (!r.ok) {
      setComposeError(r.error);
      return false;
    }
    onEntry(r.entry);
    const first = arr((r.entry.data as Scripts).scripts)[0];
    if (first) {
      setPlatform("all");
      setStatus("all");
      onSelect(first.id);
    }
    return true;
  };

  const statusCounts: Record<string, number> = {};
  for (const s of list) statusCounts[s.status ?? "idea"] = (statusCounts[s.status ?? "idea"] ?? 0) + 1;
  const counts: Record<string, number> = { all: list.length };
  for (const s of list) counts[s.platform] = (counts[s.platform] ?? 0) + 1;

  return (
    <div className="flex flex-col gap-8">
      <Composer busy={composeBusy} error={composeError} onSubmit={compose} />

      {!list.length ? (
        busySet ? (
          <Writing label="Writing your first six scripts" />
        ) : error ? (
          <ErrorBox error={error} onRetry={onNewSet} />
        ) : (
          <Writing label="Writing your first six scripts" />
        )
      ) : (
        <section className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center gap-2 sm:pl-16">
            <div className="no-scrollbar -mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1">
              {[{ id: "all", short: "All" }, ...PLATFORMS].map((p) =>
                p.id === "all" || counts[p.id] ? (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-medium transition-colors",
                      platform === p.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {p.short}
                    <span className={cn("tabular-nums", platform === p.id ? "text-background/60" : "text-muted-foreground/70")}>{counts[p.id] ?? 0}</span>
                  </button>
                ) : null,
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Segmented value={status} onChange={(v) => setStatus(v as ScriptStatus | "all")} options={[{ id: "all", label: "All" }, ...STATUS.map((x) => ({ id: x.id, label: `${x.label} ${statusCounts[x.id] ?? 0}` }))]} />
              <button
                onClick={onNewSet}
                disabled={busySet}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[0.8rem] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
                title="Write six fresh scripts and add them to the top"
              >
                {busySet ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {busySet ? "Writing six…" : "Six new scripts"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive sm:pl-16">{error}</p>}

          {!shown.length ? (
            <div className={cn(card, "flex flex-col items-center gap-2 px-6 py-14 text-center")}>
              <p className="font-medium">No scripts match these filters</p>
              <button
                onClick={() => {
                  setPlatform("all");
                  setStatus("all");
                }}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Show all scripts
              </button>
            </div>
          ) : (
            <div className="max-w-[800px]">
              {busySet && (
                <div className={cn("mb-8 flex items-center gap-2 rounded-2xl border border-pink/30 bg-pink-soft/50 px-4 py-3 text-[0.84rem] text-pink-ink", gutter)}>
                  <Loader2 className="size-3.5 animate-spin" /> Writing six new scripts. They&apos;ll show up first in the Index.
                </div>
              )}
              <DocShell chapters={shown.map((x) => ({ id: x.id, title: x.title, hint: shortPlatform(x.platform) }))} active={current?.id ?? null} onSelect={onSelect}>
                {current && <ScriptSection key={current.id} s={current} n={shown.indexOf(current) + 1} onPatch={patchScript} onEntry={onEntry} save={saveState[current.id]} />}
              </DocShell>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ErrorBox({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className={cn(card, "flex flex-col items-start gap-3 p-6")}>
      <p className="text-sm">{error}</p>
      <button onClick={onRetry} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background">
        <RotateCcw className="size-3.5" /> Try again
      </button>
    </div>
  );
}

function Select({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; className?: string }) {
  return (
    <label className={cn("relative inline-flex h-8 items-center", className)}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 cursor-pointer appearance-none rounded-full border bg-card pr-8 pl-3 text-[0.8rem] font-medium outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/40">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
    </label>
  );
}

// ------------------------------------------------------------------ composer

function Composer({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (topic: string, o: { platform: string; length: string; format: string }) => Promise<boolean> }) {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState<string>("TikTok");
  const [length, setLength] = useState<string>("30s");
  const [format, setFormat] = useState(FORMATS[0]!);
  const ref = useRef<HTMLTextAreaElement>(null);

  const pickPlatform = (p: string) => {
    setPlatform(p);
    if (p === "YouTube") setLength("3-5 min");
    else if (length === "3-5 min") setLength("30s");
  };
  const submit = async () => {
    if (!topic.trim() || busy) return;
    if (await onSubmit(topic.trim(), { platform, length, format })) setTopic("");
  };

  return (
    <div className={cn(card, "group/compose relative overflow-hidden transition-[border-color,box-shadow] focus-within:border-foreground/20 focus-within:shadow-[var(--shadow-lift)]")}>
      {busy && <motion.div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-pink to-transparent" animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <label className="text-[0.8rem] font-medium text-muted-foreground" htmlFor="lab-topic">
          New script
        </label>
        <textarea
          id="lab-topic"
          ref={ref}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          maxLength={600}
          placeholder="What's the video about? Add any real details you want in it: what happened, what went wrong, what you're testing."
          className="field-sizing-content min-h-[3.25rem] w-full resize-none bg-transparent text-[1.02rem] leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
        {/* Starter topics and options open up when you click into the box, so it stays compact otherwise. */}
        {!topic && (
          <div className="hidden flex-wrap gap-1.5 group-focus-within/compose:flex">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTopic(s);
                  ref.current?.focus();
                }}
                className="rounded-full border bg-background px-3 py-1 text-[0.78rem] text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className={cn("flex-wrap items-center gap-2 border-t pt-3", topic || busy ? "flex" : "hidden group-focus-within/compose:flex")}>
          <Segmented value={platform} onChange={pickPlatform} options={PLATFORMS.map((p) => ({ id: p.id, label: p.short }))} />
          <Segmented value={length} onChange={setLength} options={LENGTHS.map((l) => ({ id: l, label: l, disabled: platform === "YouTube" ? l === "15s" || l === "30s" : l === "3-5 min" }))} />
          <Select value={format} onChange={setFormat} options={FORMATS.map((f) => ({ id: f, label: f }))} />
          <button
            disabled={!topic.trim() || busy}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground pr-3 pl-4 text-sm font-medium text-background transition-opacity disabled:opacity-30"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Writing
              </>
            ) : (
              <>
                Write script <ArrowUp className="size-3.5" />
              </>
            )}
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { id: string; label: string; disabled?: boolean }[] }) {
  return (
    <div className="inline-flex h-8 items-center rounded-full bg-secondary p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          // Keep focus where it is (Safari doesn't focus buttons on click, which would collapse the composer).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(o.id)}
          className={cn(
            "relative h-7 rounded-full px-2.5 text-[0.78rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35",
            value === o.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === o.id && <motion.span layoutId={`seg-${options.map((x) => x.id).join("")}`} className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

type SaveState = "saving" | "saved" | "error";

const REVISIONS = ["Make it shorter", "Stronger hook", "More casual, like I'm talking to a friend", "Add a joke", "Make the ending more specific"];

function ScriptSection({ s, n, onPatch, onEntry, save }: { s: Script; n: number; onPatch: (id: string, patch: Partial<Script>) => void; onEntry: (e: LabEntry) => void; save?: SaveState }) {
  const hits = useSlop(s);
  const [prompter, setPrompter] = useState(false);
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [newLine, setNewLine] = useState<number | null>(null);
  const lines = arr(s.lines);
  const hookIsFirst = !!lines[0] && lines[0].say.trim() === s.hook.trim();
  const nBlanks = blanks(s);

  const setLine = (k: number, field: "say" | "show" | "t", v: string) => {
    const next = lines.map((l, i) => (i === k ? { ...l, [field]: v } : l)).filter((l) => l.say.trim() || l.show.trim());
    const patch: Partial<Script> = { lines: next };
    if (k === 0 && field === "say" && hookIsFirst) patch.hook = v || next[0]?.say || "";
    onPatch(s.id, patch);
  };

  const act = async (kind: string, url: string, method: string, body?: unknown) => {
    setBusy(kind);
    setErr(null);
    const r = await call(url, method, body);
    setBusy(null);
    if (!r.ok) setErr(r.error);
    else onEntry(r.entry);
    return r.ok;
  };
  const revise = async (text: string) => {
    if (!text.trim() || busy) return;
    if (await act("revise", `/api/lab/script/${s.id}`, "POST", { instruction: text.trim() })) {
      setInstruction("");
      setAsking(false);
    }
  };
  const fixAi = () =>
    revise(
      `Fix these AI-sounding bits and change nothing else: ${hits
        .slice(0, 10)
        .map((h) => `${h.label} ("${h.match}")`)
        .join("; ")}`,
    );

  return (
    <section data-script={s.id} className="relative">
      {busy === "revise" && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-background/70 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-[var(--shadow-lift)]">
            <Loader2 className="size-3.5 animate-spin" /> Rewriting and running the human check…
          </span>
        </div>
      )}

      <DocTitle n={n} link={`/lab/scripts/${s.id}`}>
        <EditableText label="title" singleLine value={s.title} onSave={(v) => v && onPatch(s.id, { title: v })} />
      </DocTitle>

      {/* Meta + actions */}
      <div className="mt-3 flex flex-col gap-3 sm:pl-16">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="ink">{s.platform}</Chip>
          {s.format && <Chip>{s.format}</Chip>}
          <Chip>
            {s.length} · about {fmtSecs(spokenSeconds(s))} spoken
          </Chip>
          {nBlanks > 0 && <Chip tone="warn">{nBlanks} blank{nBlanks === 1 ? "" : "s"} to fill</Chip>}
          <HumanBadge hits={hits} />
          <span className={cn("ml-1 text-xs transition-opacity", save ? "opacity-100" : "opacity-0", save === "error" ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {save === "saving" ? "Saving…" : save === "error" ? "Couldn't save. Try again." : "Saved"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setPrompter(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[0.8rem] font-medium text-background transition-opacity hover:opacity-90">
            <Clapperboard className="size-3.5" /> Film it
          </button>
          <CopyBtn text={scriptText(s)} label="Copy" className="h-8 rounded-full border bg-card px-3" />
          <button
            onClick={() => setAsking((a) => !a)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-medium transition-colors", asking ? "border-foreground/20 bg-secondary" : "bg-card text-muted-foreground hover:text-foreground")}
          >
            <WandSparkles className="size-3.5" /> Rewrite with AI
          </button>
          {hits.length > 0 && (
            <button onClick={() => void fixAi()} disabled={!!busy} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-warn-soft px-3 text-[0.8rem] font-medium text-warn transition-opacity hover:opacity-80 disabled:opacity-50">
              <WandSparkles className="size-3.5" /> Fix AI patterns
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <div className="inline-flex h-8 items-center rounded-full bg-secondary p-0.5">
              {STATUS.map((x) => {
                const on = (s.status ?? "idea") === x.id;
                return (
                  <button
                    key={x.id}
                    onClick={() => !on && onPatch(s.id, { status: x.id })}
                    className={cn("inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[0.76rem] font-medium transition-colors", on ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground hover:text-foreground")}
                  >
                    {on && <Check className="size-3" />}
                    {x.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={async () => {
                if (!confirmDel) {
                  setConfirmDel(true);
                  setTimeout(() => setConfirmDel(false), 3000);
                  return;
                }
                await act("delete", `/api/lab/script/${s.id}`, "DELETE");
              }}
              disabled={!!busy}
              aria-label="Delete script"
              title="Delete script"
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[0.78rem] font-medium transition-colors", confirmDel ? "bg-destructive text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}
            >
              {busy === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash className="size-3.5" />}
              {confirmDel && "Delete?"}
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {asking && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden">
              <div className="flex flex-col gap-2 pt-1">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void revise(instruction);
                  }}
                  className="flex items-center gap-2 rounded-full border bg-background py-1 pr-1 pl-4 focus-within:border-foreground/25"
                >
                  <input
                    autoFocus
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="What should change? e.g. the prototype arrived broken, make it about that"
                    className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                  <button disabled={!instruction.trim() || !!busy} className="inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[0.8rem] font-medium text-background disabled:opacity-30">
                    Rewrite
                  </button>
                </form>
                <div className="flex flex-wrap gap-1.5">
                  {REVISIONS.map((r) => (
                    <button key={r} onClick={() => void revise(r)} disabled={!!busy} className="h-7 rounded-full border px-3 text-[0.75rem] text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50">
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {s.topic && <p className="text-[0.8rem] text-muted-foreground">You asked for: {s.topic}</p>}
      </div>

      {/* Separate hook (only when it isn't already the first line) */}
      {!hookIsFirst && (
        <div className="mt-7 grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[64px_minmax(0,1fr)]">
          <span className="pt-1.5 text-right">
            <span className="rounded bg-pink px-1.5 py-0.5 text-[0.62rem] font-semibold text-black uppercase">Hook</span>
          </span>
          <EditableText label="hook" value={s.hook} onSave={(v) => v && onPatch(s.id, { hook: v })} className="text-[1.3rem] leading-snug font-semibold tracking-[-0.01em]" />
        </div>
      )}

      {/* The script itself: what you say, with what's on screen underneath. */}
      <ol className="mt-7 flex flex-col gap-6">
        {lines.map((l, k) => {
          const isHook = k === 0 && hookIsFirst;
          return (
            <li key={k} className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[64px_minmax(0,1fr)]">
              <div className="flex flex-col items-end gap-1.5 pt-1">
                <EditableText label="time" singleLine value={l.t} placeholder="0s" onSave={(v) => setLine(k, "t", v)} className="text-right font-mono text-[0.72rem] text-muted-foreground tabular-nums" />
                {isHook && <span className="rounded bg-pink px-1.5 py-0.5 text-[0.6rem] font-semibold text-black uppercase">Hook</span>}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <EditableText
                  label="what you say"
                  value={l.say}
                  startEditing={newLine === k}
                  placeholder="What you say"
                  onSave={(v) => {
                    setNewLine(null);
                    setLine(k, "say", v);
                  }}
                  className={cn("leading-relaxed text-pretty", isHook ? "text-[1.3rem] leading-snug font-semibold tracking-[-0.01em]" : "text-[1.06rem]")}
                />
                <div className="flex items-start gap-1.5 text-[0.86rem] leading-relaxed text-muted-foreground">
                  <Video className="mt-[0.3rem] size-3.5 shrink-0 opacity-60" aria-hidden />
                  <EditableText label="what's on screen" value={l.show} placeholder="What's on screen" onSave={(v) => setLine(k, "show", v)} className="min-w-0 flex-1" />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[64px_minmax(0,1fr)]">
        <span />
        <button
          onClick={() => {
            onPatch(s.id, { lines: [...lines, { t: "", say: "", show: "" }] });
            setNewLine(lines.length);
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 -ml-2 text-[0.8rem] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="size-3.5" /> Add a line
        </button>
      </div>

      {/* Caption */}
      <div className="mt-8 grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[64px_minmax(0,1fr)]">
        <span className="pt-1 text-right text-[0.66rem] font-medium tracking-wide text-muted-foreground uppercase">Post</span>
        <div className="flex items-start gap-2 rounded-2xl bg-secondary/50 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[0.95rem]">
            <EditableText label="caption" value={s.caption} placeholder="Caption" onSave={(v) => onPatch(s.id, { caption: v })} />
            <EditableText
              label="hashtags"
              singleLine
              value={arr(s.hashtags).join(" ")}
              placeholder="#hashtags"
              onSave={(v) => onPatch(s.id, { hashtags: v.split(/[\s,]+/).filter(Boolean).map((h) => `#${h.replace(/^#+/, "")}`) })}
              className="text-muted-foreground"
            />
          </div>
          <CopyBtn text={`${s.caption}\n\n${arr(s.hashtags).join(" ")}`} />
        </div>
      </div>

      {prompter && <Teleprompter s={s} onClose={() => setPrompter(false)} />}
    </section>
  );
}


// ------------------------------------------------------------------ teleprompter

/** Full-screen teleprompter: the spoken lines scroll at a set speaking pace (words per minute). */
function Teleprompter({ s, onClose }: { s: Script; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(150);
  const [size, setSize] = useState(44);
  const box = useRef<HTMLDivElement>(null);
  const words = Math.max(1, spokenWords(s));
  const lines = arr(s.lines);

  const toggle = useCallback(() => setPlaying((p) => !p), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowUp") setWpm((w) => Math.min(260, w + 10));
      else if (e.key === "ArrowDown") setWpm((w) => Math.max(80, w - 10));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, toggle]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const step = (now: number) => {
      const el = box.current;
      if (!el) return;
      const dt = (now - last) / 1000;
      last = now;
      const travel = el.scrollHeight - el.clientHeight;
      // Whole script takes words / wpm minutes; scroll the travel distance in that time.
      carry += (travel / ((words / wpm) * 60)) * dt;
      const px = Math.floor(carry);
      if (px >= 1) {
        el.scrollTop += px;
        carry -= px;
      }
      if (el.scrollTop >= travel - 1) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, wpm, words]);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex flex-col bg-[#09090b] text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/70">{s.title}</span>
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-0.5 text-xs">
          <button onClick={() => setWpm((w) => Math.max(80, w - 10))} className="grid size-7 place-items-center rounded-full hover:bg-white/10" aria-label="Slower">
            <Minus className="size-3.5" />
          </button>
          <span className="w-28 text-center whitespace-nowrap tabular-nums">{wpm} words/min</span>
          <button onClick={() => setWpm((w) => Math.min(260, w + 10))} className="grid size-7 place-items-center rounded-full hover:bg-white/10" aria-label="Faster">
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="hidden items-center gap-1 rounded-full bg-white/10 p-0.5 text-xs sm:flex">
          <button onClick={() => setSize((x) => Math.max(28, x - 4))} className="grid size-7 place-items-center rounded-full text-[0.7rem] hover:bg-white/10" aria-label="Smaller text">
            A
          </button>
          <button onClick={() => setSize((x) => Math.min(72, x + 4))} className="grid size-7 place-items-center rounded-full text-sm font-semibold hover:bg-white/10" aria-label="Bigger text">
            A
          </button>
        </div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[38%] z-10 h-px bg-pink/40" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#09090b] to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#09090b] to-transparent" />
        <div ref={box} onClick={toggle} className="no-scrollbar h-full cursor-pointer overflow-y-auto">
          <div className="mx-auto flex max-w-4xl flex-col gap-[0.9em] px-6 pt-[38vh] pb-[62vh] leading-[1.25] font-semibold tracking-[-0.01em]" style={{ fontSize: size }}>
            {lines.map((l, i) => (
              <p key={i}>{l.say}</p>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-4">
        <button
          onClick={() => {
            if (box.current) box.current.scrollTop = 0;
            setPlaying(false);
          }}
          className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          aria-label="Back to start"
        >
          <RotateCcw className="size-4" />
        </button>
        <button onClick={toggle} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[0.95rem] font-semibold text-black">
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />} {playing ? "Pause" : "Start"}
        </button>
        <span className="hidden w-11 text-xs text-white/40 sm:block">Space</span>
      </div>
    </motion.div>,
    document.body,
  );
}
