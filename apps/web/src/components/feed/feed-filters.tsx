import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface FeedQuery {
  niche?: string;
  brand?: string;
  q?: string;
  sort?: string;
  format?: string;
  active?: string;
  days?: string;
  limit?: string;
  country?: string;
  price?: string;
  /** "1" = challenger brands only. */
  new?: string;
  /** Fresh-mix seed (from the cookie; never put in URLs). */
  seed?: string;
}

/** Price filter buckets (currency as written in the ad). */
export const PRICE_RANGES: Record<string, [number | undefined, number | undefined]> = { u50: [undefined, 50], "50-100": [50, 100], "100-200": [100, 200], "200+": [200, undefined] };
export const PRICE_LABEL: Record<string, string> = { u50: "Under 50", "50-100": "50–100", "100-200": "100–200", "200+": "200+" };
export const COUNTRIES: [string, string][] = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
];

/** Builds a Discover URL from the current query plus a patch. Changing any filter resets pagination. */
export function feedHref(current: FeedQuery, patch: Partial<Record<keyof FeedQuery, string | undefined>>) {
  const next: FeedQuery = { ...current, ...patch };
  if (!("limit" in patch)) delete next.limit;
  delete next.seed;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `/discover?${s}` : "/discover";
}

function Seg({ href, active, children, title }: { href: string; active: boolean; children: React.ReactNode; title?: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      title={title}
      className={cn(
        "relative inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200",
        active ? "bg-card text-foreground shadow-[var(--shadow-card)] ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border bg-surface p-0.5" role="group" aria-label={label}>
      {children}
    </div>
  );
}

const FORMATS = [
  { v: undefined, label: "All" },
  { v: "video", label: "Video" },
  { v: "image", label: "Image" },
  { v: "carousel", label: "Carousel" },
  { v: "dco", label: "Dynamic" },
];
const DAYS = [
  { v: undefined, label: "Any age" },
  { v: "7", label: "7d+" },
  { v: "30", label: "30d+" },
  { v: "90", label: "90d+" },
];
const SORTS = [
  { v: undefined, label: "Newest" },
  { v: "longest", label: "Longest running" },
  { v: "variations", label: "Most variations" },
];

export function FeedFilters({ query, total }: { query: FeedQuery; total: number }) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-b bg-background/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
        <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
        <Group label="Format">
          {FORMATS.map((f) => (
            <Seg key={f.label} href={feedHref(query, { format: f.v })} active={query.format === f.v}>
              {f.label}
            </Seg>
          ))}
        </Group>
        <Group label="Days running">
          {DAYS.map((d) => (
            <Seg key={d.label} href={feedHref(query, { days: d.v })} active={query.days === d.v} title={d.v ? `Running at least ${d.v} days` : undefined}>
              {d.label}
            </Seg>
          ))}
        </Group>
        <Group label="Status">
          <Seg href={feedHref(query, { active: query.active ? undefined : "1" })} active={!!query.active}>
            <span className={cn("size-1.5 rounded-full transition-colors", query.active ? "bg-ok" : "bg-muted-foreground/40")} />
            Active only
          </Seg>
        </Group>
        <div className="ml-auto flex shrink-0 items-center gap-3 pl-2">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span> ads
          </span>
          <Group label="Sort">
            {SORTS.map((s) => (
              <Seg key={s.label} href={feedHref(query, { sort: s.v })} active={query.sort === s.v}>
                {s.label}
              </Seg>
            ))}
          </Group>
        </div>
      </div>
    </div>
  );
}
