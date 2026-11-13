"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveBrandSettings, type BrandProfileSettings } from "@/app/studio-actions";
import { cn } from "@/lib/utils";

const FIELDS: { key: keyof BrandProfileSettings; label: string; hint: string; rows: number }[] = [
  { key: "name", label: "Brand name", hint: "Used in every AI answer and breakdown.", rows: 1 },
  { key: "products", label: "What you sell", hint: "Products, materials, price range.", rows: 2 },
  { key: "audience", label: "Who you sell to", hint: "Age, sport, mindset.", rows: 2 },
  { key: "voice", label: "Brand voice", hint: "How your ads should sound.", rows: 2 },
  { key: "offers", label: "Offers you can run", hint: "Shipping, returns, discounts.", rows: 2 },
];

/** The brand every AI answer is written for. */
export function BrandForm({ initial }: { initial: BrandProfileSettings }) {
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBrandSettings(p);
          if (r.ok) {
            setSaved(p);
            toast.success("Brand profile saved");
          } else toast.error(r.error ?? "Could not save");
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      {FIELDS.map((f) => (
        <label key={f.key} className={cn("flex flex-col gap-1.5", f.key !== "name" && f.key !== "offers" && "sm:col-span-1", f.key === "name" && "sm:col-span-2")}>
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{f.label}</span>
            <span className="text-xs text-muted-foreground">{f.hint}</span>
          </span>
          <textarea
            value={p[f.key]}
            onChange={(e) => setP({ ...p, [f.key]: e.target.value })}
            rows={f.rows}
            className="resize-none rounded-2xl border bg-surface px-4 py-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-pink/60 focus:shadow-[0_0_0_4px_var(--pink-soft)]"
          />
        </label>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          disabled={!dirty || pending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-ink-foreground transition-[transform,opacity] active:scale-95 disabled:opacity-40"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save changes
        </button>
        {!dirty && <span className="text-xs text-muted-foreground">All changes saved</span>}
      </div>
    </form>
  );
}
