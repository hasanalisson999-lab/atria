"use client";

import { Check, ListFilter, Shuffle, X } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newFeedBatch } from "@/app/feed-actions";
import { COUNTRIES, PRICE_LABEL, feedHref, type FeedQuery } from "@/components/feed/feed-filters";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const FORMAT_LABEL: Record<string, string> = { video: "Video", image: "Image", carousel: "Carousel", dco: "Catalog" };
const SORTS = [
  { id: "fresh", label: "For you", title: "A fresh mix of proven brand ads you haven't seen, new every hour" },
  { id: "newest", label: "Newest", title: "Latest launches first" },
  { id: "longest", label: "Longest running", title: "Ads that kept running the longest (proven winners)" },
  { id: "variations", label: "Most scaled", title: "Creatives running as the most ads" },
];

/** Sticky feed bar: filters on the left, a sliding sort switch and "New batch" on the right. */
export function FeedToolbar({ query, total }: { query: FeedQuery; total: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [spin, setSpin] = useState(0);
  const go = (patch: Partial<Record<keyof FeedQuery, string | undefined>>) => start(() => router.push(feedHref(query, patch), { scroll: false }));
  const sort = query.sort ?? "fresh";

  const chips: { label: string; clear: Partial<Record<keyof FeedQuery, undefined>> }[] = [];
  if (query.format) chips.push({ label: FORMAT_LABEL[query.format] ?? query.format, clear: { format: undefined } });
  if (query.days) chips.push({ label: `${query.days}+ days`, clear: { days: undefined } });
  if (query.active) chips.push({ label: "Active only", clear: { active: undefined } });
  if (query.new) chips.push({ label: "Challenger brands", clear: { new: undefined } });
  if (query.country) chips.push({ label: COUNTRIES.find((c) => c[0] === query.country)?.[1] ?? query.country, clear: { country: undefined } });
  if (query.price) chips.push({ label: `Price ${PRICE_LABEL[query.price] ?? query.price}`, clear: { price: undefined } });

  const newBatch = () => {
    setSpin((s) => s + 1);
    start(async () => {
      await newFeedBatch();
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    });
  };

  return (
    <div className="sticky top-14 z-20 -mx-4 flex items-center gap-2 border-b bg-background/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-secondary data-[state=open]:bg-secondary",
            chips.length && "border-foreground/30",
          )}
        >
          <ListFilter className="size-4" />
          <span className="hidden sm:inline">Filter</span>
          {chips.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-pink font-mono text-[0.62rem] font-semibold text-[#0a0a0b]">{chips.length}</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
          <DropdownMenuLabel>Format</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={query.format ?? "all"} onValueChange={(v) => go({ format: v === "all" ? undefined : v })}>
            <DropdownMenuRadioItem value="all">All formats</DropdownMenuRadioItem>
            {Object.entries(FORMAT_LABEL).map(([v, l]) => (
              <DropdownMenuRadioItem key={v} value={v}>
                {l}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Running for</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={query.days ?? "any"} onValueChange={(v) => go({ days: v === "any" ? undefined : v })}>
            <DropdownMenuRadioItem value="any">Any time</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="7">7+ days</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="30">30+ days (proven)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="90">90+ days (evergreen)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Price</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={query.price ?? "any"} onValueChange={(v) => go({ price: v === "any" ? undefined : v })}>
            <DropdownMenuRadioItem value="any">Any price</DropdownMenuRadioItem>
            {Object.entries(PRICE_LABEL).map(([v, l]) => (
              <DropdownMenuRadioItem key={v} value={v}>
                {l}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Country</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={query.country ?? "all"} onValueChange={(v) => go({ country: v === "all" ? undefined : v })}>
            <DropdownMenuRadioItem value="all">All countries</DropdownMenuRadioItem>
            {COUNTRIES.map(([v, l]) => (
              <DropdownMenuRadioItem key={v} value={v}>
                {l}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={!!query.new} onCheckedChange={(c) => go({ new: c ? "1" : undefined })}>
            Challenger brands only
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={!!query.active} onCheckedChange={(c) => go({ active: c ? "1" : undefined })}>
            Active ads only
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className={cn("no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto transition-opacity", pending && "opacity-60")}>
        <span className="hidden shrink-0 text-sm whitespace-nowrap text-muted-foreground md:inline">
          <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span> creatives
        </span>
        {chips.map((c) => (
          <button
            key={c.label}
            onClick={() => go(c.clear)}
            className="inline-flex h-7 shrink-0 animate-enter items-center gap-1 rounded-full bg-ink pr-1.5 pl-2.5 text-xs font-medium text-ink-foreground transition-opacity hover:opacity-85"
          >
            {c.label} <X className="size-3" />
          </button>
        ))}
      </div>

      {/* Sort: sliding segmented control (a compact menu on phones) */}
      <div className="hidden items-center rounded-full bg-secondary p-1 lg:flex" role="radiogroup" aria-label="Sort">
        {SORTS.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={sort === s.id}
            title={s.title}
            onClick={() => sort !== s.id && go({ sort: s.id === "fresh" ? undefined : s.id })}
            className={cn("relative h-7 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors", sort === s.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {sort === s.id && <motion.span layoutId="feed-sort" className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" transition={{ type: "spring", bounce: 0.18, duration: 0.45 }} />}
            <span className="relative">{s.label}</span>
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium lg:hidden">{SORTS.find((s) => s.id === sort)?.label}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {SORTS.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => go({ sort: s.id === "fresh" ? undefined : s.id })} className="justify-between">
              {s.label} {sort === s.id && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {sort === "fresh" && (
        <button
          onClick={newBatch}
          disabled={pending}
          title="Deal a completely new batch of ads you haven't seen"
          className="group/nb inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-ink pr-4 pl-1 text-sm font-medium text-ink-foreground transition-transform active:scale-95 disabled:opacity-70"
        >
          <motion.span animate={{ rotate: spin * 180 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid size-7 place-items-center rounded-full bg-pink text-[#0a0a0b]">
            <Shuffle className="size-3.5" />
          </motion.span>
          <span className="hidden sm:inline">{pending ? "Shuffling…" : "New batch"}</span>
        </button>
      )}
    </div>
  );
}
