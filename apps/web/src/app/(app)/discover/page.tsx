import { CATEGORIES } from "@signal/shared";
import { SearchX, Sparkles, X } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { categoryRemaining } from "@/app/category-actions";
import { BrandAvatar } from "@/components/brand-avatar";
import { CategorySeeder } from "@/components/feed/category-seeder";
import { PRICE_RANGES, feedHref, type FeedQuery } from "@/components/feed/feed-filters";
import { FeedToolbar } from "@/components/feed/feed-toolbar";
import { InfiniteFeed } from "@/components/feed/infinite-feed";
import { LiveSearch } from "@/components/feed/live-search";
import { NicheTabs } from "@/components/feed/niche-tabs";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { FEED_FORMATS, getFeed, getNicheCounts, getTopBrands, newFeedSeed, type BrandChip, type FeedSort } from "@/lib/server/ads";
import { refreshStale } from "@/lib/server/brand-sync";
import { getSql, isUnavailable } from "@/lib/server/db";
import { feedFitFor, getMyBrand } from "@/lib/server/my-brand";
import { SEED_COOKIE } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Discover" };

type SP = Awaited<PageProps<"/discover">["searchParams"]>;
const one = (v: SP[string]) => (typeof v === "string" ? v.trim() || undefined : undefined);

const TABS = [...CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.emoji })), { id: "brands", label: "All brands", icon: "★" }];

export default function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  return (
    <Suspense fallback={<DiscoverSkeleton />}>
      <Discover searchParams={searchParams} />
    </Suspense>
  );
}

function DiscoverSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonBlock className="h-10 w-64" />
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-11 w-32 rounded-full" />
        ))}
      </div>
      <div className="columns-2 gap-5 lg:columns-3 2xl:columns-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonBlock key={i} className={cn("mb-5 rounded-[20px]", ["aspect-[9/16]", "aspect-square", "aspect-[4/5]"][i % 3])} />
        ))}
      </div>
    </div>
  );
}

function BrandRail({ brands, query, title, hint }: { brands: BrandChip[]; query: FeedQuery; title?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Sparkles className="size-3.5 text-pink-ink dark:text-pink" /> {title}
          {hint && <span className="font-normal">· {hint}</span>}
        </span>
      )}
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {!title && (
          <Link
            href={feedHref(query, { brand: undefined })}
            scroll={false}
            className={cn("flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-colors hover:bg-secondary", !query.brand && "bg-secondary")}
          >
            <span className={cn("grid size-12 place-items-center rounded-full border bg-card font-display text-xs font-semibold", !query.brand && "ring-2 ring-pink ring-offset-2 ring-offset-background")}>All</span>
            <span className="w-full truncate text-center text-[0.7rem] font-medium">All brands</span>
          </Link>
        )}
        {brands.map((b) => {
          const on = b.id === query.brand;
          return (
            <Link
              key={b.id}
              href={feedHref(query, { brand: on ? undefined : b.id })}
              scroll={false}
              title={`${b.name} · ${b.ads} creatives`}
              className={cn("group/brand flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-colors hover:bg-secondary", on && "bg-secondary")}
            >
              <BrandAvatar
                name={b.name}
                src={b.logo_url}
                fallbackSrc={b.logo_small}
                className={cn("size-12 transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover/brand:scale-110", on && "ring-2 ring-pink ring-offset-2 ring-offset-background")}
              />
              <span className="w-full truncate text-center text-[0.7rem] font-medium">{b.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function Discover({ searchParams }: { searchParams: PageProps<"/discover">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const nicheRaw = one(sp.niche);
  const q = one(sp.q);
  const me = await getMyBrand();
  const home = me?.category ?? "footwear";
  // A keyword search looks across every brand unless a category is picked explicitly.
  const niche = TABS.some((t) => t.id === nicheRaw) ? nicheRaw! : q ? "brands" : home;
  // Your category is personalized (competitors first, your price band and keywords); other categories are browsed as-is.
  const personal = !!me && niche === home && !q;
  const fit = me && personal ? await feedFitFor(me) : undefined;
  const sort = one(sp.sort);
  const format = one(sp.format);
  const days = one(sp.days);
  const country = one(sp.country);
  const price = one(sp.price);
  const query: FeedQuery = {
    niche: niche === home ? undefined : niche,
    brand: one(sp.brand),
    q,
    sort: sort === "longest" || sort === "variations" || sort === "newest" ? sort : undefined,
    format: FEED_FORMATS.includes(format as (typeof FEED_FORMATS)[number]) ? format : undefined,
    active: one(sp.active) === "1" ? "1" : undefined,
    days: days && ["7", "30", "90"].includes(days) ? days : undefined,
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    price: price && price in PRICE_RANGES ? price : undefined,
    new: one(sp.new) === "1" ? "1" : undefined,
    // The seed lives in a cookie for an hour (set by proxy.ts); "New batch" replaces it.
    seed: (await cookies()).get(SEED_COOKIE)?.value ?? newFeedSeed(),
  };
  const [pMin, pMax] = query.price ? PRICE_RANGES[query.price]! : [undefined, undefined];
  const feedParams = {
    niche,
    brandId: query.brand,
    q: query.q,
    sort: (query.sort as FeedSort | undefined) ?? "fresh",
    format: query.format as (typeof FEED_FORMATS)[number] | undefined,
    active: !!query.active,
    minDays: query.days ? Number(query.days) : undefined,
    country: query.country,
    priceMin: pMin,
    priceMax: pMax,
    challengers: !!query.new,
    fit,
  };

  // Keep content flowing: refresh a few stale brands of this category in the background (instant sources).
  after(async () => {
    const sql = getSql();
    if (!isUnavailable(sql)) await refreshStale(sql, { category: CATEGORIES.some((c) => c.id === niche) ? niche : home, max: 4 }).catch(() => 0);
  });
  const isCategory = CATEGORIES.some((c) => c.id === niche);
  const [counts, brands, challengers, feed, remaining] = await Promise.all([
    getNicheCounts(),
    getTopBrands(niche, 40),
    isCategory ? getTopBrands(niche, 30, { challengers: true }) : Promise.resolve(null),
    getFeed({ ...feedParams, seed: query.seed, limit: 48 }),
    isCategory ? categoryRemaining(niche) : Promise.resolve(0),
  ]);
  if (!feed.ok) return <ErrorState title="Feed unavailable" reason={feed.reason} />;
  const c = counts.ok ? counts.data : {};
  const cat = CATEGORIES.find((x) => x.id === niche);
  const label = cat?.label ?? (niche === "brands" ? "All brands" : "Everything");
  const allBrands = brands.ok ? brands.data : [];
  const selectedBrand = allBrands.find((b) => b.id === query.brand);
  const newBrands = challengers && challengers.ok ? challengers.data : [];

  return (
    <>
      <div className="stagger flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display display-tight text-[2.2rem] font-semibold sm:text-[2.8rem]">
            {q ? (
              <>
                &ldquo;{q}&rdquo; <span className="text-muted-foreground">in real brand ads.</span>
              </>
            ) : (
              <>
                {personal && me ? (
                  <>
                    For {me.name}. <span className="text-muted-foreground">{label} ads worth stealing from.</span>
                  </>
                ) : (
                  <>
                    {label} <span className="text-muted-foreground">ads that work.</span>
                  </>
                )}
              </>
            )}
          </h1>
          <span className="text-sm text-muted-foreground">
            <b className="font-semibold text-foreground tabular-nums">{(c[niche] ?? 0).toLocaleString()}</b> creatives · <b className="font-semibold text-foreground tabular-nums">{allBrands.length}</b> brands
          </span>
        </div>


        <NicheTabs
          active={niche}
          items={[...TABS.filter((t) => t.id === home), ...TABS.filter((t) => t.id !== home)].map((t) => ({
            ...t,
            label: t.id === home && me ? `For ${me.name}` : t.label,
            count: c[t.id] ?? 0,
            href: feedHref({}, { niche: t.id === home ? undefined : t.id }),
          }))}
        />

        {allBrands.length > 0 && <BrandRail brands={allBrands} query={query} />}
        {newBrands.length > 2 && !query.brand && <BrandRail brands={newBrands} query={query} title="New & challenger brands" hint="see how they're innovating" />}
        {isCategory && <CategorySeeder key={niche} categoryId={niche} label={label} count={c[niche] ?? 0} remaining={remaining} />}
      </div>

      <section className="flex flex-col gap-5">
        <FeedToolbar query={query} total={feed.data.total} />
        {(query.q || selectedBrand) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {selectedBrand && (
              <Link href={feedHref(query, { brand: undefined })} scroll={false} className="inline-flex items-center gap-1.5 rounded-full bg-ink py-1 pr-2 pl-1 text-xs text-ink-foreground">
                <BrandAvatar name={selectedBrand.name} src={selectedBrand.logo_url} fallbackSrc={selectedBrand.logo_small} className="size-5" />
                {selectedBrand.name}
                <X className="size-3" />
              </Link>
            )}
            {query.q && (
              <Link href={feedHref(query, { q: undefined })} scroll={false} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs">
                &ldquo;{query.q}&rdquo; <X className="size-3" />
              </Link>
            )}
            {selectedBrand && (
              <Link href={`/brands/${selectedBrand.id}`} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Open brand page →
              </Link>
            )}
          </div>
        )}
        {query.q && <LiveSearch q={query.q} found={feed.data.total} />}
        {feed.data.ads.length ? (
          <InfiniteFeed key={JSON.stringify(query)} initial={feed.data.ads} total={feed.data.total} params={feedParams} />
        ) : (
          !query.q &&
          !(isCategory && remaining > 0) && (
            <EmptyState
              icon={SearchX}
              title="No ads match these filters"
              description={query.country ? "Few ads disclose their target countries. Try All countries." : "Try another category, clear the brand, or loosen a filter."}
            />
          )
        )}
      </section>
    </>
  );
}
