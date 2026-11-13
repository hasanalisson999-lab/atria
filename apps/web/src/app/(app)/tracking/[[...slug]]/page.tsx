import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { BrandAvatar } from "@/components/brand-avatar";
import { TrackButton } from "@/components/brands/track-button";
import { ErrorState, SkeletonBlock } from "@/components/states";
import { KeywordManager, type KeywordGroup } from "@/components/tracking/keyword-manager";
import { TrackingApp } from "@/components/tracking/tracking-app";
import { getBrandList } from "@/lib/server/ads";
import { refreshStale } from "@/lib/server/brand-sync";
import { getKeywords } from "@/lib/server/data";
import { getSql, isUnavailable } from "@/lib/server/db";
import { getMyBrand } from "@/lib/server/my-brand";
import { getWatchData } from "@/lib/server/tracking";

export const metadata = { title: "Tracking" };

/** /tracking is the overview; /tracking/<brandId> opens one competitor (switching between them is client-side). */
export default function TrackingPage({ params }: PageProps<"/tracking/[[...slug]]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Tracking params={params} />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-12 lg:grid-cols-[232px_minmax(0,1fr)]">
      <div className="hidden flex-col gap-2 lg:flex">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-8">
        <SkeletonBlock className="h-24 w-2/3 rounded-2xl" />
        <SkeletonBlock className="h-24 rounded-2xl" />
        <SkeletonBlock className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

async function Tracking({ params }: { params: PageProps<"/tracking/[[...slug]]">["params"] }) {
  await connection();
  const [{ slug = [] }, data, me] = await Promise.all([params, getWatchData(), getMyBrand()]);
  // Competitors' newest ads keep arriving in the background (instant sources, never blocks the page).
  after(async () => {
    const sql = getSql();
    if (!isUnavailable(sql)) await refreshStale(sql, { category: me?.category ?? null, max: 6 }).catch(() => 0);
  });
  if (!data.ok) return <ErrorState title="Tracking unavailable" reason={data.reason} />;
  if (slug.length > 1 || (slug[0] && !data.data.moves.some((m) => m.id === slug[0]))) redirect("/tracking");
  if (!data.data.moves.length) return <EmptyWatch />;
  return (
    <TrackingApp
      data={data.data}
      brandName={me?.name ?? null}
      extras={
        <>
          <Suspense fallback={null}>
            <Suggested category={me?.category ?? null} />
          </Suspense>
          <details className="group/kw border-t pt-8">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[1.05rem] font-semibold tracking-[-0.01em]">Discovery keywords</span>
                <span className="text-sm text-muted-foreground">Searched in the Ad Library to find brands you don&apos;t know yet</span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/kw:rotate-180" />
            </summary>
            <div className="pt-5">
              <Suspense fallback={<SkeletonBlock className="h-72 rounded-2xl" />}>
                <Keywords />
              </Suspense>
            </div>
          </details>
        </>
      }
    />
  );
}

function EmptyWatch() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-[2rem] font-semibold tracking-[-0.03em]">Watch your competitors</h1>
      <p className="text-[0.95rem] text-muted-foreground">
        Track a brand and Atria follows every ad it runs: new launches, ads it switches off and creatives it scales. Your weekly read on what to test next.
      </p>
      <div className="flex gap-2">
        <Link href="/brands" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
          Pick competitors
        </Link>
        <Link href="/settings" className="rounded-full border px-5 py-2.5 text-sm font-medium">
          Edit competitors
        </Link>
      </div>
    </div>
  );
}

/** Brands in your category worth watching that you don't track yet. */
async function Suggested({ category }: { category: string | null }) {
  await connection();
  const list = await getBrandList(category ?? "brands");
  if (!list.ok) return null;
  const pick = list.data
    .filter((b) => b.status !== "tracked" && b.thumbs.length > 0)
    .sort((a, b) => b.new_14d - a.new_14d || b.active_ads - a.active_ads)
    .slice(0, 6);
  if (!pick.length) return null;
  return (
    <section className="flex flex-col gap-5 border-t pt-8">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em]">Worth watching</h2>
        <p className="text-sm text-muted-foreground">Active brands in your category you don&apos;t track yet</p>
      </div>
      <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
        {pick.map((b) => (
          <li key={b.id} className="flex items-center gap-3 border-b py-3">
            <BrandAvatar name={b.name} src={b.logo_url} fallbackSrc={b.logo_small} className="size-8" />
            <Link href={`/brands/${b.id}`} className="flex min-w-0 flex-1 flex-col hover:underline">
              <span className="truncate text-sm font-medium">{b.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {b.active_ads} live{b.new_14d ? ` · ${b.new_14d} new in 14 days` : ""}
              </span>
            </Link>
            <TrackButton brandId={b.id} status={b.status} size="sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Keywords() {
  await connection();
  const kw = await getKeywords();
  if (!kw.ok) return <ErrorState reason={kw.reason} />;
  const map = new Map<string, KeywordGroup>();
  for (const k of kw.data) {
    const g = map.get(k.term) ?? { term: k.term, countries: [], status: k.status as KeywordGroup["status"], source: k.source, ads: 0, brands: 0 };
    g.countries.push(k.country);
    g.ads += k.total_ads_found;
    g.brands += k.new_brands_found;
    if (k.status === "active") g.status = "active";
    map.set(k.term, g);
  }
  return <KeywordManager groups={[...map.values()].sort((a, b) => a.term.localeCompare(b.term))} />;
}
