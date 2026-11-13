"use client";

import { ArrowRight, Check, Loader2, ShieldCheck, WandSparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useMemo, useState } from "react";
import { detectSlop, groupHits, type SlopHit } from "@/lib/slop";
import { cn } from "@/lib/utils";
import { card, CopyBtn, EASE } from "./lab-ui";

const KINDS = [
  { id: "script", label: "Video script" },
  { id: "caption", label: "Caption" },
  { id: "copy", label: "Ad or website copy" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

const SAMPLE = `Here's the thing: most sneakers aren't built for real life. They're built for one thing. That's why I'm on a journey to revolutionize everyday footwear — a shoe that seamlessly takes you from the gym to the streets. It's not just a shoe, it's a lifestyle. Join me on this incredible journey!`;

/** Non-overlapping hit ranges, so each character is highlighted at most once. */
function ranges(hits: SlopHit[]) {
  const out: SlopHit[] = [];
  for (const h of [...hits].sort((a, b) => a.start - b.start || b.end - a.end)) if (!out.length || h.start >= out.at(-1)!.end) out.push(h);
  return out;
}

function Marked({ text, hits }: { text: string; hits: SlopHit[] }) {
  const rs = ranges(hits);
  const parts: React.ReactNode[] = [];
  let at = 0;
  rs.forEach((h, i) => {
    if (h.start > at) parts.push(<Fragment key={`t${i}`}>{text.slice(at, h.start)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} title={`${h.label}: ${h.fix}`} className={cn("rounded-[4px] px-0.5 text-inherit", h.severity === "high" ? "bg-warn-soft underline decoration-warn/60 decoration-2 underline-offset-[3px]" : "bg-secondary")}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    at = h.end;
  });
  if (at < text.length) parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <p className="text-[0.97rem] leading-[1.75] whitespace-pre-wrap">{parts}</p>;
}

/** Paste anything (a script, a caption, ad copy) and see every AI pattern, then get a minimum-edit human rewrite. */
export function HumanCheck() {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>("script");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; changes: string[]; from: string } | null>(null);

  const hits = useMemo(() => detectSlop(text, kind === "script" ? "say" : "copy"), [text, kind]);
  const groups = groupHits(hits);
  const resultHits = useMemo(() => (result ? detectSlop(result.text, kind === "script" ? "say" : "copy") : []), [result, kind]);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const rewrite = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/lab/humanize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, kind }) });
      const j = (await res.json()) as { ok: true; text: string; changes: string[] } | { ok: false; error: string };
      if (j.ok) setResult({ text: j.text, changes: j.changes, from: text });
      else setErr(j.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className={cn(card, "flex flex-col overflow-hidden")}>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <div className="inline-flex h-8 items-center rounded-full bg-secondary p-0.5">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={cn("h-7 rounded-full px-3 text-[0.78rem] font-medium transition-colors", kind === k.id ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground hover:text-foreground")}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{words} words</span>
            {!text && (
              <button onClick={() => setText(SAMPLE)} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Try an example
              </button>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            placeholder="Paste a script, caption or ad copy. Every AI pattern gets flagged as you type."
            className="field-sizing-content min-h-48 w-full resize-none bg-transparent px-5 py-4 text-[0.97rem] leading-[1.75] outline-none placeholder:text-muted-foreground/60"
          />
          {text.trim() && hits.length > 0 && (
            <div className="border-t bg-secondary/30 px-5 py-4">
              <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">Flagged</span>
              <div className="mt-1.5">
                <Marked text={text} hits={hits} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">Checks run instantly in your browser. The rewrite uses the free AI and keeps your voice.</span>
            <button
              onClick={() => void rewrite()}
              disabled={!text.trim() || busy}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity disabled:opacity-30"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />} {busy ? "Rewriting" : "Rewrite it human"}
            </button>
          </div>
        </div>

        <aside className={cn(card, "flex flex-col gap-4 p-5 lg:sticky lg:top-20")}>
          <div className="flex items-center gap-3">
            <span className={cn("grid size-10 place-items-center rounded-xl", !text.trim() ? "bg-secondary text-muted-foreground" : hits.length ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
              <ShieldCheck className="size-5" />
            </span>
            <div className="flex flex-col">
              <span className="text-[1.05rem] font-semibold">
                {!text.trim() ? "Nothing to check yet" : hits.length ? `${hits.length} AI pattern${hits.length === 1 ? "" : "s"}` : "Reads human"}
              </span>
              <span className="text-xs text-muted-foreground">Rules from the no-ai-slop editing guide</span>
            </div>
          </div>
          {text.trim() && !hits.length && <p className="text-sm text-muted-foreground">No AI words, em dashes, fake contrasts or hype found. Read it out loud once before you post.</p>}
          {!text.trim() && (
            <ul className="flex flex-col gap-1.5 text-[0.84rem] text-muted-foreground">
              {["AI words like delve, elevate, seamless", "“It's not X, it's Y” contrasts", "Em dashes and colon reveals", "“Join me on this journey” endings", "Made-up details in scripts"].map((x) => (
                <li key={x} className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0" />
                  {x}
                </li>
              ))}
            </ul>
          )}
          {groups.length > 0 && (
            <ul className="flex flex-col divide-y">
              {groups.map((g) => (
                <li key={g.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-1.5 rounded-full", g.severity === "high" ? "bg-warn" : "bg-muted-foreground/50")} />
                    {g.label}
                    {g.matches.length > 1 && <span className="text-xs font-normal text-muted-foreground">×{g.matches.length}</span>}
                  </span>
                  <span className="text-[0.8rem] text-muted-foreground">
                    {g.matches.slice(0, 3).map((m) => `“${m}”`).join(", ")}
                  </span>
                  <span className="text-[0.8rem]">{g.fix}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <AnimatePresence>
        {result && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className={cn(card, "flex flex-col overflow-hidden")}>
            <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
              <span className="font-semibold">Human rewrite</span>
              <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[0.72rem] font-medium", resultHits.length ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
                <ShieldCheck className="size-3" /> {resultHits.length ? `${resultHits.length} left` : "Reads human"}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <CopyBtn text={result.text} label="Copy" />
                <button
                  onClick={() => {
                    setText(result.text);
                    setResult(null);
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Use this <ArrowRight className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="px-5 py-4">
                <Marked text={result.text} hits={resultHits} />
              </div>
              {result.changes.length > 0 && (
                <div className="border-t bg-secondary/30 px-5 py-4 lg:border-t-0 lg:border-l">
                  <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">What changed</span>
                  <ul className="mt-2 flex flex-col gap-2 text-[0.84rem]">
                    {result.changes.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
