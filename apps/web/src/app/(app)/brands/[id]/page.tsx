import { ArrowLeft, ArrowUpRight, BadgeDollarSign, CalendarClock, Clock3, Flame, Globe2, Layers, Megaphone, MousePointerClick, Package, Quote, Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { BrandAvatar } from "@/components/brand-avatar";
import { HookExplorer } from "@/components/brands/hook-explorer";
import { ProfileTabs } from "@/components/brands/profile-tabs";
import { SyncButton } from "@/components/brands/sync-button";
import { IgnoreButton, TrackButton } from "@/components/brands/track-button";
import { AdGrid } from "@/components/feed/ad-grid";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { BrandAds } from "@/components/brands/brand-ads";
import { CollectingAds } from "@/components/brands/collecting-ads";
import { getBrand, getFeed } from "@/lib/server/ads";
import { getBrandProfile, type BrandProfile, type Counted } from "@/lib/server/brand-profile";
import { cn } from "@/lib/utils";

export const metadata = { title: "Brand" };

const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function Card({ title, icon: Icon, children, className, hint }: { title: string; icon?: React.ElementType; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-3xl border bg-card p-5 sm:p-6", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Bars({ items, unit = "" }: { items: Counted[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  if (!items.length) return <p className="text-sm text-muted-foreground">Not enough data yet.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i, k) => (
        <li key={i.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate capitalize">{i.label}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {i.n}
              {unit}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full origin-left animate-[grow_900ms_var(--ease-out-quart)_both] rounded-full", k === 0 ? "bg-pink" : "bg-foreground/70")}
              style={{ width: `${(i.n / max) * 100}%`, animationDelay: `${k * 50}ms` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Cadence({ data }: { data: BrandProfile["cadence"] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((a, d) => a + d.n, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-36 items-end gap-1">
        {data.map((d, i) => (
          <div key={d.week} className="group/bar relative flex h-full flex-1 items-end">
            <div
              className={cn("w-full origin-bottom animate-[growy_800ms_var(--ease-out-quart)_both] rounded-t-md transition-colors", d.n ? "bg-pink/80 group-hover/bar:bg-pink" : "bg-secondary")}
              style={{ height: `${Math.max(4, (d.n / max) * 100)}%`, animationDelay: `${i * 18}ms` }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 font-mono text-[0.62rem] whitespace-nowrap text-ink-foreground opacity-0 transition-opacity group-hover/bar:opacity-100">
              {d.n} · {new Date(d.week).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-mono text-[0.65rem] text-muted-foreground">
        <span>{new Date(data[0]!.week).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>
        <span>{total} new creatives in 6 months</span>
        <span>this week</span>
      </div>
    </div>
  );
}

function Chips({ items, max }: { items: Counted[]; max: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) => {
        const w = k.n / max;
        return (
          <span
            key={k.label}
            className={cn("rounded-full border px-3 py-1 transition-colors hover:border-pink", w > 0.66 ? "bg-ink text-sm font-semibold text-ink-foreground" : w > 0.33 ? "bg-pink-soft text-sm text-pink-ink" : "bg-card text-xs")}
          >
            {k.label} <span className="opacity-60">{k.n}</span>
          </span>
        );
      })}
    </div>
  );
}

async function Body({ params }: { params: PageProps<"/brands/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const brand = await getBrand(id);
  if (!brand.ok) return <ErrorState reason={brand.reason} />;
  if (!brand.data) return <ErrorState title="Brand not found" reason="It may have been removed." />;
  const b = brand.data;
  const [profileR, feed, winnersR] = await Promise.all([
    getBrandProfile(b.id, b.name),
    getFeed({ niche: "everything", brandId: id, sort: "newest", limit: 600 }),
    getFeed({ niche: "everything", brandId: id, sort: "longest", active: true, limit: 10 }),
  ]);
  const p = profileR.ok ? profileR.data : null;
  const winners = winnersR.ok ? winnersR.data.ads : [];
  const newThisMonth = p ? p.cadence.slice(-4).reduce((a, d) => a + d.n, 0) : 0;
  const topHook = p?.hooks[0];

  const kpis: { icon: React.ElementType; label: string; value: number; suffix?: string; compact?: boolean }[] = [
    { icon: Layers, label: "Unique creatives", value: p?.creatives ?? b.ads },
    { icon: Megaphone, label: "Active now", value: p?.active ?? b.active_ads },
    { icon: CalendarClock, label: "New (4 weeks)", value: newThisMonth },
    { icon: Clock3, label: "Longest running", value: b.longest_days ?? 0, suffix: "d" },
  ];

  return (
    <>
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start gap-5">
          <BrandAvatar name={b.name} src={b.logo_url} fallbackSrc={b.logo_small} className="size-20 animate-enter rounded-[22px] shadow-[var(--shadow-lift)] sm:size-[5.5rem]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <h1 className="font-display display-tight text-[2.4rem] leading-none font-semibold sm:text-[3.2rem]">{b.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {b.domain && (
                <a href={`https://${b.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline">
                  {b.domain} <ArrowUpRight className="size-3.5" />
                </a>
              )}
              {b.category && <span className="capitalize">{b.category}</span>}
              {b.pages > 1 && <span>{b.pages} regional pages</span>}
              {b.page_likes ? <span>{compact(b.page_likes)} followers</span> : null}
              {b.ads_synced_at && <span>Updated {new Date(b.ads_synced_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SyncButton brandId={b.id} name={b.name} autoStart={needsFetch(b.ads, b.ads_synced_at)} />
            <TrackButton brandId={b.id} status={b.status} />
            <IgnoreButton brandId={b.id} status={b.status} />
          </div>
        </div>
        {p && <p className="max-w-3xl text-[1.02rem] leading-relaxed text-pretty">{summary(b.name, p, newThisMonth)}</p>}
        <dl className="stagger flex flex-wrap divide-x rounded-2xl border bg-card">
          {kpis.map((k) => (
            <div key={k.label} className="flex min-w-[8.5rem] flex-1 flex-col gap-0.5 px-5 py-3.5">
              <dt className="text-xs text-muted-foreground">{k.label}</dt>
              <dd className="font-display text-2xl font-semibold tracking-[-0.04em] tabular-nums">
                {k.compact ? compact(k.value) : <AnimatedNumber value={k.value} />}
                {k.suffix}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {!p ? (
        <ErrorState reason={profileR.ok ? "" : profileR.reason} />
      ) : (
        <ProfileTabs
          tabs={[
            {
              id: "ads",
              label: "All ads",
              count: feed.ok ? feed.data.total : undefined,
              content: feed.ok && feed.data.ads.length ? <BrandAds ads={feed.data.ads} /> : <CollectingAds brandId={b.id} name={b.name} expecting={needsFetch(b.ads, b.ads_synced_at)} />,
            },
            {
              id: "overview",
              label: "Insights",
              content: (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card title="Proven winners" icon={Flame} hint="Active, longest running" className="lg:col-span-3">
                    {winners.length ? <AdGrid ads={winners} layout="row" /> : <p className="text-sm text-muted-foreground">No active ads right now.</p>}
                  </Card>
                  <Card title="Launch cadence" icon={CalendarClock} hint="New creatives per week" className="lg:col-span-2">
                    <Cadence data={p.cadence} />
                  </Card>
                  <Card title="How long ads run" icon={Clock3}>
                    <Bars items={p.longevity} />
                  </Card>
                  <Card title="At a glance" icon={Sparkles} className="lg:col-span-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        { k: "Top hook", v: topHook ? `“${topHook.text}”` : "—", sub: topHook ? `${topHook.maxDays}d longest run` : "" },
                        { k: "Main offer", v: p.offers[0]?.label ?? "No explicit offers", sub: p.offers[0] ? `${p.offers[0].n} creatives` : "" },
                        { k: "Go-to CTA", v: p.ctas[0]?.label ?? "—", sub: p.ctas[0] ? `${p.ctas[0].n} creatives` : "" },
                        { k: "Price range", v: p.prices ? `${p.prices.currency}${p.prices.min} – ${p.prices.currency}${p.prices.max}` : "—", sub: p.prices ? `median ${p.prices.currency}${p.prices.median}` : "" },
                        { k: "Main format", v: p.formats[0]?.label ?? "—", sub: p.formats[0] ? `${Math.round((p.formats[0].n / Math.max(1, p.creatives)) * 100)}% of creatives` : "" },
                        { k: "Copy length", v: `${p.copy.avgWords} words avg`, sub: `${p.copy.shortShare}% short · ${p.copy.longShare}% long-form` },
                        { k: "Emoji in copy", v: `${p.copy.emojiShare}%`, sub: `${p.copy.questionShare}% open with a question` },
                        { k: "Markets", v: p.countries.slice(0, 4).map((c) => c.label).join(" ") || "Global", sub: `${p.countries.length} countries seen` },
                      ].map((x) => (
                        <div key={x.k} className="flex flex-col gap-1 rounded-2xl bg-surface p-4">
                          <span className="text-xs text-muted-foreground">{x.k}</span>
                          <span className="line-clamp-2 text-sm font-semibold">{x.v}</span>
                          {x.sub && <span className="text-xs text-muted-foreground">{x.sub}</span>}
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ),
            },
            {
              id: "hooks",
              label: "Hooks",
              count: p.hooks.length,
              content: p.hooks.length ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Every opening line {b.name} uses, ranked by how long it kept running (long runs mean it works). {p.analyzed ? `${p.analyzed} come from AI video breakdowns.` : "Opening ads adds AI-detected video hooks here."}
                  </p>
                  <HookExplorer hooks={p.hooks} brandId={b.id} brandName={b.name} />
                </div>
              ) : (
                <EmptyState icon={Quote} title="No hooks yet" description="Hooks appear once the brand's ads are collected." />
              ),
            },
            {
              id: "messaging",
              label: "Messaging",
              content: (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card title="Words they repeat" icon={Quote} hint="Across unique creatives" className="lg:col-span-2">
                    {p.keywords.length ? <Chips items={p.keywords} max={p.keywords[0]!.n} /> : <p className="text-sm text-muted-foreground">Not enough copy yet.</p>}
                  </Card>
                  <Card title="Signature phrases" icon={Sparkles}>
                    <Bars items={p.phrases.slice(0, 12)} />
                  </Card>
                  <Card title="Headlines" icon={Megaphone}>
                    <ul className="flex flex-col divide-y">
                      {p.headlines.slice(0, 14).map((h) => (
                        <li key={h.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="line-clamp-1">{h.label}</span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">×{h.n}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                  {(p.aiAngles.length > 0 || p.aiAudiences.length > 0) && (
                    <Card title="AI-detected angles & audiences" icon={Sparkles} className="lg:col-span-2">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <ul className="flex flex-col gap-2 text-sm">
                          {p.aiAngles.map((a) => (
                            <li key={a.label} className="rounded-xl bg-surface p-3">
                              {a.label}
                            </li>
                          ))}
                        </ul>
                        <ul className="flex flex-col gap-2 text-sm">
                          {p.aiAudiences.map((a) => (
                            <li key={a.label} className="rounded-xl bg-pink-soft/60 p-3">
                              {a.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Card>
                  )}
                </div>
              ),
            },
            {
              id: "offers",
              label: "Offers & pricing",
              count: p.offers.length,
              content: (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card title="Offer playbook" icon={BadgeDollarSign} hint="Share of unique creatives" className="lg:col-span-2">
                    {p.offers.length ? (
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {p.offers.map((o) => (
                          <li key={o.label} className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold">{o.label}</span>
                              <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[0.65rem] text-ink-foreground">{Math.round((o.n / Math.max(1, p.creatives)) * 100)}%</span>
                            </div>
                            {o.examples.slice(0, 2).map((e) => (
                              <p key={e} className="line-clamp-2 text-xs text-muted-foreground">
                                “…{e}…”
                              </p>
                            ))}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No explicit offers found: this brand sells on product, not discounts.</p>
                    )}
                  </Card>
                  <div className="flex flex-col gap-4">
                    <Card title="Price points" icon={BadgeDollarSign}>
                      {p.prices ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-end justify-between">
                            {(["min", "median", "max"] as const).map((k) => (
                              <div key={k} className="flex flex-col">
                                <span className="text-xs text-muted-foreground capitalize">{k}</span>
                                <span className="font-display text-2xl font-semibold tracking-[-0.04em]">
                                  {p.prices!.currency}
                                  {p.prices![k]}
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">{p.prices.count} prices seen in ads and product cards.</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No prices shown in their ads.</p>
                      )}
                    </Card>
                    <Card title="Discount levels" icon={BadgeDollarSign}>
                      {p.discounts.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {p.discounts.map((d) => (
                            <span key={d} className="rounded-full bg-pink px-3 py-1 font-mono text-sm font-semibold text-[#0a0a0b]">
                              {d}% off
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No percentage discounts used.</p>
                      )}
                    </Card>
                  </div>
                </div>
              ),
            },
            {
              id: "products",
              label: "Products",
              count: p.products.length,
              content: p.products.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {p.products.map((pr, i) => (
                    <a
                      key={pr.title}
                      href={pr.link ?? undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group/p card-interactive flex flex-col overflow-hidden rounded-2xl border bg-card"
                      style={{ animation: "var(--animate-enter)", animationDelay: `${Math.min(i, 18) * 30}ms` }}
                    >
                      <div className="aspect-square overflow-hidden bg-white">
                        {pr.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pr.image} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-contain transition-transform duration-500 group-hover/p:scale-105" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <span className="line-clamp-2 text-sm font-medium">{pr.title}</span>
                        <span className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{pr.price ?? ""}</span>
                          <span>in {pr.ads} ad{pr.ads === 1 ? "" : "s"}</span>
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Package} title="No product cards" description="This brand's ads don't use catalog / product cards." />
              ),
            },
            {
              id: "landing",
              label: "Landing pages",
              count: p.landingPages.length,
              content: (
                <Card title="Where the ads send people" icon={MousePointerClick} hint="Unique creatives per page">
                  <ul className="flex flex-col divide-y">
                    {p.landingPages.map((l) => (
                      <li key={l.label} className="flex items-center gap-3 py-2.5 text-sm">
                        <a href={`https://${l.label}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
                          {l.label}
                        </a>
                        <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-secondary sm:block">
                          <div className="h-full rounded-full bg-pink" style={{ width: `${(l.n / Math.max(1, p.landingPages[0]!.n)) * 100}%` }} />
                        </div>
                        <span className="w-10 text-right font-mono text-xs text-muted-foreground">{l.n}</span>
                        <ArrowUpRight className="size-3.5 text-muted-foreground" />
                      </li>
                    ))}
                  </ul>
                </Card>
              ),
            },
            {
              id: "mix",
              label: "Creative mix",
              content: (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card title="Formats" icon={Layers}>
                    <Bars items={p.formats} />
                  </Card>
                  <Card title="Calls to action" icon={MousePointerClick}>
                    <Bars items={p.ctas} />
                  </Card>
                  <Card title="Placements" icon={Megaphone}>
                    <Bars items={p.platforms} />
                  </Card>
                  <Card title="Countries" icon={Globe2}>
                    <Bars items={p.countries.slice(0, 10)} />
                  </Card>
                  {p.aiFormats.length > 0 && (
                    <Card title="AI creative styles" icon={Sparkles} className="md:col-span-2 xl:col-span-4">
                      <Chips items={p.aiFormats} max={p.aiFormats[0]!.n} />
                    </Card>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

/** One plain sentence on how this brand advertises, built from the numbers (no AI, never wrong). */
function summary(name: string, p: BrandProfile, newThisMonth: number): string {
  const parts = [`${name} runs ${p.active} live ad${p.active === 1 ? "" : "s"}`];
  if (newThisMonth) parts.push(`launched ${newThisMonth} new in the last 4 weeks`);
  const fmt = p.formats[0];
  if (fmt && p.creatives) parts.push(`${Math.round((fmt.n / p.creatives) * 100)}% ${fmt.label.toLowerCase()}`);
  let s = parts.join(", ") + ".";
  const leans = [p.ctas[0] && `“${p.ctas[0].label}”`, p.offers[0] && `${p.offers[0].label.toLowerCase()} offers`].filter(Boolean);
  if (leans.length) s += ` Leans on ${leans.join(" and ")}.`;
  if (p.prices) s += p.prices.min === p.prices.max ? ` Shows prices around ${p.prices.currency}${p.prices.min}.` : ` Prices shown ${p.prices.currency}${p.prices.min}–${p.prices.currency}${p.prices.max}.`;
  return s;
}

/** Few ads and not fetched in the last 3 days: collect the rest automatically on open. */
function needsFetch(ads: number, syncedAt: string | null): boolean {
  return ads < 25 && (!syncedAt || Date.parse(syncedAt) < Date.now() - 3 * 864e5);
}

export default function BrandPage({ params }: PageProps<"/brands/[id]">) {
  return (
    <>
      <Link href="/brands" className="-mb-4 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> All brands
      </Link>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <SkeletonBlock className="h-80 rounded-[32px]" />
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-96 rounded-3xl" />
          </div>
        }
      >
        <Body params={params} />
      </Suspense>
    </>
  );
}
