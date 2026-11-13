"use client";

import { Fragment } from "react";
import type { Citation } from "@/app/studio-actions";
import { useAdPanel } from "@/components/ad/ad-panel";
import { cn } from "@/lib/utils";

function Inline({ text: raw, cites, onCite }: { text: string; cites: Map<string, Citation>; onCite: (c: Citation) => void }) {
  // Models sometimes group refs ("[A5, A17]"): split them into single [A#] refs.
  const text = raw.replace(/\[(A\d+(?:\s*[,;]\s*A\d+)+)\]/g, (_m, list: string) => list.split(/\s*[,;]\s*/).map((r) => `[${r}]`).join(""));
  const parts = text.split(/(\*\*[^*]+\*\*|\[A\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        const m = p.match(/^\[(A\d+)\]$/);
        if (m) {
          const c = cites.get(m[1]!);
          if (!c) return null;
          return (
            <button
              key={i}
              onClick={() => onCite(c)}
              title={`${c.brand} · ${c.headline ?? ""}`}
              className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-pink-soft py-0.5 pr-2 pl-0.5 align-middle text-[0.7rem] font-medium text-pink-ink transition-colors hover:bg-pink hover:text-[#0a0a0b]"
            >
              {c.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.thumbnail_url} alt="" referrerPolicy="no-referrer" className="size-4 rounded-full object-cover" />
              ) : (
                <span className="size-4 rounded-full bg-pink" />
              )}
              {c.brand}
            </button>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Minimal Markdown (headings, lists, bold, [A#] citations that open the source ad). */
export function Answer({ text, citations, compact }: { text: string; citations: Citation[]; compact?: boolean }) {
  const panel = useAdPanel();
  const cites = new Map(citations.map((c) => [c.ref, c]));
  const onCite = (c: Citation) => panel.open(c.id, citations.map((x) => ({ id: x.id, thumbnail_url: x.thumbnail_url })));
  const lines = text.split("\n");
  return (
    <div className={cn("flex flex-col gap-2 leading-relaxed", compact ? "text-sm" : "text-[0.94rem]")}>
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t || /^-{3,}$/.test(t)) return <div key={i} className="h-1" />;
        if (/^#{1,4}\s/.test(t))
          return (
            <h3 key={i} className={cn("mt-2 font-display font-semibold tracking-[-0.02em]", compact ? "text-base" : "text-lg")}>
              <Inline text={t.replace(/^#+\s/, "")} cites={cites} onCite={onCite} />
            </h3>
          );
        const num = t.match(/^(\d+)[.)]\s+(.*)$/);
        if (num)
          return (
            <div key={i} className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[0.68rem] text-ink-foreground">{num[1]}</span>
              <p className="flex-1">
                <Inline text={num[2]!} cites={cites} onCite={onCite} />
              </p>
            </div>
          );
        if (/^[-*•]\s/.test(t))
          return (
            <div key={i} className="flex gap-2.5 pl-1">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-pink" />
              <p className="flex-1">
                <Inline text={t.replace(/^[-*•]\s/, "")} cites={cites} onCite={onCite} />
              </p>
            </div>
          );
        return (
          <p key={i}>
            <Inline text={t} cites={cites} onCite={onCite} />
          </p>
        );
      })}
    </div>
  );
}
