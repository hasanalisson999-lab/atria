"use client";

import { Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useOptimistic, useRef, useTransition } from "react";
import { toast } from "sonner";
import { addKeyword, deleteKeyword, setKeywordStatus } from "@/app/actions";
import { cn } from "@/lib/utils";

export interface KeywordGroup {
  term: string;
  countries: string[];
  status: "active" | "paused" | "pending";
  source: string;
  ads: number;
  brands: number;
}

export function KeywordManager({ groups }: { groups: KeywordGroup[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [adding, startAdd] = useTransition();
  const [, startToggle] = useTransition();
  const [optimistic, apply] = useOptimistic(groups, (state, patch: { term: string; status?: KeywordGroup["status"]; remove?: boolean }) =>
    patch.remove ? state.filter((g) => g.term !== patch.term) : state.map((g) => (g.term === patch.term ? { ...g, status: patch.status ?? g.status } : g)),
  );

  const toggle = (g: KeywordGroup) =>
    startToggle(async () => {
      const next = g.status === "active" ? "paused" : "active";
      apply({ term: g.term, status: next });
      const r = await setKeywordStatus(g.term, next);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  const remove = (g: KeywordGroup) =>
    startToggle(async () => {
      apply({ term: g.term, remove: true });
      const r = await deleteKeyword(g.term);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        action={(fd) =>
          startAdd(async () => {
            const r = await addKeyword(fd);
            if (r.ok) {
              toast.success(r.message);
              formRef.current?.reset();
            } else toast.error(r.error);
          })
        }
        className="flex flex-col gap-2 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center"
      >
        <input name="term" required minLength={2} maxLength={60} placeholder="Add a keyword, e.g. stability running shoes" className="h-10 flex-1 rounded-full border bg-surface px-4 text-sm outline-none transition-shadow focus:border-pink/60 focus:shadow-[0_0_0_4px_var(--pink-soft)]" />
        <input name="countries" defaultValue="US, GB, DE" className="h-10 rounded-full border bg-surface px-4 font-mono text-xs outline-none transition-shadow focus:border-pink/60 focus:shadow-[0_0_0_4px_var(--pink-soft)] sm:w-40" aria-label="Countries" />
        <button disabled={adding} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-ink-foreground transition-shadow hover:shadow-[var(--glow-pink)] disabled:opacity-60">
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
        </button>
      </form>

      <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
        {optimistic.map((g, i) => (
          <li
            key={g.term}
            className={cn("group/kw flex items-center gap-3 px-4 py-2.5 transition-[background-color,opacity] duration-300 hover:bg-surface/70", g.status === "paused" && "opacity-55")}
            style={{ animation: "var(--animate-enter)", animationDelay: `${Math.min(i, 20) * 20}ms` }}
          >
            <span className={cn("size-2 shrink-0 rounded-full transition-colors", g.status === "active" ? "bg-ok shadow-[0_0_0_3px_var(--ok-soft)]" : "bg-muted-foreground/40")} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.term}</span>
            <span className="hidden font-mono text-[0.68rem] text-muted-foreground sm:block">{g.countries.join(" ")}</span>
            <span className="hidden w-20 text-right font-mono text-[0.68rem] text-muted-foreground md:block">{g.ads} ads</span>
            <span className="rounded-full border px-2 py-0.5 font-mono text-[0.6rem] text-muted-foreground">{g.source}</span>
            <button onClick={() => toggle(g)} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label={g.status === "active" ? `Pause ${g.term}` : `Resume ${g.term}`}>
              {g.status === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            {g.source === "manual" && (
              <button onClick={() => remove(g)} className="grid size-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-[opacity,color] group-hover/kw:opacity-100 hover:text-destructive" aria-label={`Remove ${g.term}`}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
