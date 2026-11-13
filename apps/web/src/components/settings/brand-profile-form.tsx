"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMyBrand, type BrandEdit } from "@/app/brand-actions";
import { cn } from "@/lib/utils";

const field = "w-full rounded-2xl border bg-card px-4 py-2.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-foreground/30 focus:shadow-[0_0_0_4px_var(--pink-soft)]";

/** Your brand, in one form: everything the feed, Tracking and the Brand Lab are personalized around. */
export function BrandProfileForm({ initial }: { initial: BrandEdit }) {
  const router = useRouter();
  const [b, setB] = useState(initial);
  const [lists, setLists] = useState({ competitors: initial.competitors.join(", "), keywords: initial.keywords.join(", ") });
  const [pending, start] = useTransition();
  const set = <K extends keyof BrandEdit>(k: K, v: BrandEdit[K]) => setB((x) => ({ ...x, [k]: v }));
  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveMyBrand({ ...b, competitors: split(lists.competitors), keywords: split(lists.keywords) });
          if (r.ok) {
            toast.success("Brand saved");
            router.refresh();
          } else toast.error(r.error);
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Row label="Brand name">
        <input value={b.name} onChange={(e) => set("name", e.target.value)} className={field} />
      </Row>
      <Row label="Website" hint="Optional">
        <input value={b.url} onChange={(e) => set("url", e.target.value)} placeholder="oneletic.com" className={field} />
      </Row>
      <Row label="What you sell" wide>
        <textarea value={b.products} onChange={(e) => set("products", e.target.value)} rows={2} className={cn(field, "resize-none")} />
      </Row>
      <Row label="Price" hint="Approx. is fine">
        <div className="flex items-center gap-2">
          <input type="number" min={0} value={b.priceMin ?? ""} onChange={(e) => set("priceMin", e.target.value ? Number(e.target.value) : null)} placeholder="from" className={field} />
          <span className="text-muted-foreground">–</span>
          <input type="number" min={0} value={b.priceMax ?? ""} onChange={(e) => set("priceMax", e.target.value ? Number(e.target.value) : null)} placeholder="to" className={field} />
        </div>
      </Row>
      <Row label="Voice">
        <input value={b.voice} onChange={(e) => set("voice", e.target.value)} className={field} />
      </Row>
      <Row label="Who it's for" wide>
        <textarea value={b.audience} onChange={(e) => set("audience", e.target.value)} rows={2} className={cn(field, "resize-none")} />
      </Row>
      <Row label="Offers" hint="Only real ones" wide>
        <input value={b.offers} onChange={(e) => set("offers", e.target.value)} placeholder="Free shipping, 30-day returns" className={field} />
      </Row>
      <Row label="Competitors" hint="Comma-separated · tracked automatically" wide>
        <input value={lists.competitors} onChange={(e) => setLists((l) => ({ ...l, competitors: e.target.value }))} className={field} />
      </Row>
      <Row label="Keywords" hint="Comma-separated" wide>
        <input value={lists.keywords} onChange={(e) => setLists((l) => ({ ...l, keywords: e.target.value }))} className={field} />
      </Row>
      <div className="sm:col-span-2">
        <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-ink-foreground transition-opacity disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
        </button>
      </div>
    </form>
  );
}

function Row({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
