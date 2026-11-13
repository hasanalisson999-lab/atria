import { CATEGORIES } from "@signal/shared";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandDirectory } from "@/components/brands/brand-directory";
import { ErrorState, SkeletonBlock } from "@/components/states";
import { getBrandCounts, getBrandIndex, getBrandList, type BrandTab } from "@/lib/server/ads";
import { getMyBrand } from "@/lib/server/my-brand";
import { cn } from "@/lib/utils";

export const metadata = { title: "Brands" };

const EXTRA: { id: BrandTab; label: string }[] = [
  { id: "tracked", label: "Tracking" },
  { id: "unvetted", label: "Unvetted" },
  { id: "ignored", label: "Hidden" },
];

export default function BrandsPage({ searchParams }: PageProps<"/brands">) {
  return (
    <Suspense fallback={<BrandsSkeleton />}>
      <BrandsBody searchParams={searchParams} />
    </Suspense>
  );
}

function BrandsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonBlock className="h-14 w-80" />
      <SkeletonBlock className="h-10 w-full rounded-full" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-80 rounded-[26px]" />
        ))}
      </div>
    </div>
  );
}

async function BrandsBody({ searchParams }: { searchParams: PageProps<"/brands">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const me = await getMyBrand();
  const valid = new Set<string>(["brands", ...CATEGORIES.map((c) => c.id), ...EXTRA.map((e) => e.id)]);
  const tab = (typeof sp.tab === "string" && valid.has(sp.tab) ? sp.tab : "brands") as BrandTab;
  const [list, counts, tracked, index] = await Promise.all([getBrandList(tab), getBrandCounts(), tab === "brands" ? getBrandList("tracked") : Promise.resolve(null), getBrandIndex()]);
  if (!list.ok) return <ErrorState reason={list.reason} />;
  const c = (counts.ok ? counts.data : {}) as Record<string, number>;
  // Your category first, then the rest by size.
  const cats = [...CATEGORIES].filter((x) => (c[x.id] ?? 0) > 0 || x.id === me?.category).sort((a, b) => Number(b.id === me?.category) - Number(a.id === me?.category) || (c[b.id] ?? 0) - (c[a.id] ?? 0));
  const tabs = [{ id: "brands", label: "All" }, ...cats.map((x) => ({ id: x.id, label: x.label })), ...EXTRA];
  const competitors = tracked?.ok ? tracked.data : [];

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display display-tight text-[2.2rem] font-semibold sm:text-[2.8rem]">Brands</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {(c.brands ?? 0).toLocaleString()} real brands, each matched to its official pages. Can&apos;t find one? Search it at the top and Atria adds it in seconds.
        </p>
      </header>

      <nav className="no-scrollbar sticky top-14 z-20 -mx-4 flex gap-1 overflow-x-auto border-b bg-background/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" aria-label="Brand categories">
        {tabs.map((t, i) => (
          <Link
            key={t.id}
            href={t.id === "brands" ? "/brands" : `/brands?tab=${t.id}`}
            scroll={false}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors",
              t.id === tab ? "bg-ink font-medium text-ink-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              i === tabs.length - EXTRA.length && "ml-3 border-l pl-4 max-sm:ml-0",
            )}
          >
            {t.label}
            {c[t.id] != null && <span className={cn("font-mono text-[0.66rem] tabular-nums", t.id === tab ? "text-ink-foreground/60" : "text-muted-foreground/70")}>{c[t.id]}</span>}
          </Link>
        ))}
      </nav>

      <BrandDirectory rows={list.data} competitors={competitors} myName={me?.name ?? null} tab={tab} index={index.ok ? index.data : []} category={me?.category ?? null} />
    </>
  );
}
