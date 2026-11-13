import {
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Database,
  Sparkles,
} from "lucide-react";
import { connection } from "next/server";
import { getSourceUsage } from "@/lib/server/data";
import { cn } from "@/lib/utils";

/** Free data sources and AI models, with how much of each free allowance is used. */
function Meter({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn(
          "h-full origin-left animate-[grow_900ms_var(--ease-out-quart)_both] rounded-full",
          pct > 85 ? "bg-destructive" : pct > 60 ? "bg-warn" : "bg-ok",
        )}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

interface Src {
  name: string;
  detail: string;
  ok: boolean;
  used: number;
  total: number;
  unit: string;
  money?: boolean;
}

function SourceCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Database;
  items: Src[];
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[28px] border bg-card p-2">
      <span className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {title}
      </span>
      {items.map((s, i) => (
        <div
          key={s.name}
          className="flex flex-col gap-2 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface"
          style={{
            animation: "var(--animate-enter)",
            animationDelay: `${i * 50}ms`,
          }}
        >
          <div className="flex items-center gap-2.5">
            {s.ok ? (
              <CheckCircle2 className="size-4 shrink-0 text-ok" />
            ) : (
              <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{s.name}</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              · {s.detail}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[0.7rem] text-muted-foreground tabular-nums">
              {!s.ok
                ? "not connected"
                : s.money
                  ? `${s.used.toFixed(2)} / ${s.total.toFixed(2)}`
                  : `${s.used.toLocaleString()} / ${s.total.toLocaleString()}`}
            </span>
          </div>
          {s.ok && <Meter used={s.used} total={s.total} />}
        </div>
      ))}
    </div>
  );
}

export async function DataSources() {
  await connection();
  const u = await getSourceUsage();
  const x = u.ok ? u.data : null;
  const data: Src[] = [
    {
      name: "SerpApi",
      detail: "250 searches / month",
      ok: !!process.env.SERPAPI_API_KEY,
      used: x?.serpapiMonth ?? 0,
      total: 250,
      unit: "searches",
    },
    {
      name: "Metapi",
      detail: "Facebook Ad Library · 3,000 ads / month",
      ok: !!process.env.METAPI_API_KEY,
      used: x?.metapiMonth ?? 0,
      total: 3000,
      unit: "ads",
    },
    {
      name: "SearchAPI.io",
      detail: "100 searches, one-time · also finds brands",
      ok: !!process.env.SEARCHAPI_API_KEY,
      used: x?.searchapiTotal ?? 0,
      total: 100,
      unit: "searches",
    },
    {
      name: "ScrapeCreators",
      detail: "Facebook + TikTok · 100 free credits",
      ok: !!process.env.SCRAPECREATORS_API_KEY,
      used: x?.scrapecreatorsTotal ?? 0,
      total: 100,
      unit: "credits",
    },
    {
      name: "SocialCrawl",
      detail: "Facebook + TikTok · 100 free credits",
      ok: !!process.env.SOCIALCRAWL_API_KEY,
      used: x?.socialcrawlTotal ?? 0,
      total: 100,
      unit: "credits",
    },
    {
      name: "Social Fetch",
      detail: "Facebook + TikTok · 100 free credits (30 ads each)",
      ok: !!process.env.SOCIALFETCH_API_KEY,
      used: x?.socialfetchTotal ?? 0,
      total: 100,
      unit: "credits",
    },
    {
      name: "Adyntel",
      detail: "Finds brands by website · 50 free credits",
      ok: !!process.env.ADYNTEL_API_KEY && !!process.env.ADYNTEL_EMAIL,
      used: x?.adyntelTotal ?? 0,
      total: 50,
      unit: "credits",
    },
    {
      name: "Parse",
      detail: "Facebook Ad Library · 200 free credits (3 per 30 ads)",
      ok: !!process.env.PARSE_API_KEY,
      used: x?.parseTotal ?? 0,
      total: 200,
      unit: "credits",
    },
    {
      name: "Adspo",
      detail: "Brand creatives (no copy) · 10,000 free credits / year",
      ok: !!process.env.ADSPO_API_KEY,
      used: x?.adspoTotal ?? 0,
      total: 10000,
      unit: "credits",
    },
    {
      name: "Bright Data",
      detail: "Keyword search, last resort (slow) · free credits",
      ok: !!process.env.BRIGHTDATA_API_TOKEN,
      used: x?.brightdataTotal ?? 0,
      total: 3000,
      unit: "records",
    },
    {
      name: "Apify (3 actors)",
      detail: "3 scrapers sharing $4.50 of the free $5/month",
      ok: !!process.env.APIFY_TOKEN,
      used: x?.apifyUsd ?? 0,
      total: x?.apifyBudget || 4.5,
      unit: "USD",
      money: true,
    },
  ];
  const ai: Src[] = [
    {
      name: "Gemini",
      detail: "Breakdowns + copy · ~920 free / day",
      ok: !!process.env.GEMINI_API_KEY,
      used: x?.geminiToday ?? 0,
      total: 920,
      unit: "today",
    },
    {
      name: "Groq",
      detail: "Fast fallback · best free model auto-picked",
      ok: !!process.env.GROQ_API_KEY,
      used: x?.groqToday ?? 0,
      total: 1000,
      unit: "today",
    },
    {
      name: "OpenRouter",
      detail: ":free models, auto-updated list",
      ok: !!process.env.OPENROUTER_API_KEY,
      used: x?.openrouterToday ?? 0,
      total: 50,
      unit: "today",
    },
    {
      name: "Voyage",
      detail: "Embeddings for similar hooks & ads",
      ok: !!process.env.VOYAGE_API_KEY,
      used: x?.voyageTokens ?? 0,
      total: 200_000_000,
      unit: "tokens",
    },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SourceCard
        title="Ad Library data · fallback order"
        icon={Database}
        items={data}
      />
      <SourceCard title="AI models · all free" icon={BrainCircuit} items={ai} />
      <p className="flex items-center gap-2 text-xs text-muted-foreground lg:col-span-2">
        <Sparkles className="size-3.5" /> Lookups are cached, so asking for the
        same brand twice costs nothing. A provider is skipped once its free
        allowance is used.
      </p>
    </div>
  );
}
