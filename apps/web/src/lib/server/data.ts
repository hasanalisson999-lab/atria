import "server-only";
import { envStatus, guardrails, type EnvKeyStatus } from "@signal/shared/env";
import { query, type Result } from "./db";

export interface Overview {
  ads: number;
  activeAds: number;
  brands: number;
  winners: number;
  keywords: { active: number; pending: number; paused: number };
  migrations: string[];
}

export function getOverview(): Promise<Result<Overview>> {
  return query(async (sql) => {
    const [counts] = await sql<{ ads: number; active_ads: number; brands: number; winners: number }[]>`
      select (select count(*)::int from public.ads) as ads,
             (select count(*)::int from public.ads where is_active) as active_ads,
             (select count(*)::int from public.brands) as brands,
             (select count(*)::int from public.ads where is_winner) as winners`;
    const kw = await sql<{ status: string; n: number }[]>`select status::text, count(*)::int as n from public.keywords group by status`;
    const migrations = await sql<{ name: string }[]>`select name from public.signal_migrations order by name`;
    const k = Object.fromEntries(kw.map((r) => [r.status, r.n]));
    return {
      ads: counts!.ads,
      activeAds: counts!.active_ads,
      brands: counts!.brands,
      winners: counts!.winners,
      keywords: { active: k.active ?? 0, pending: k.pending ?? 0, paused: k.paused ?? 0 },
      migrations: migrations.map((m) => m.name),
    };
  });
}

export interface KeywordRow {
  id: string;
  term: string;
  country: string;
  source: string;
  status: string;
  last_run_at: string | null;
  total_ads_found: number;
  new_brands_found: number;
}

export function getKeywords(): Promise<Result<KeywordRow[]>> {
  return query(
    (sql) => sql<KeywordRow[]>`
      select id, term, country, source::text, status::text, last_run_at, total_ads_found, new_brands_found
      from public.keywords order by term, country`,
  );
}

export interface SpendRow {
  provider: string;
  spentUsd: number;
  budgetUsd: number;
  calls: number;
}

const PROVIDERS = ["apify", "anthropic", "voyage", "elevenlabs", "meta", "openai"];

export function getSpend(): Promise<Result<SpendRow[]>> {
  const fallbackBudget = guardrails().MONTHLY_BUDGET_USD;
  return query(async (sql) => {
    const spent = await sql<{ provider: string; usd: string; calls: number }[]>`
      select provider, coalesce(sum(usd), 0)::text as usd, count(*)::int as calls
      from public.cost_ledger where created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      group by provider`;
    const budgets = await sql<{ provider: string; monthly_usd: string }[]>`select provider, monthly_usd::text from public.provider_budgets`;
    const s = new Map(spent.map((r) => [r.provider, r]));
    const b = new Map(budgets.map((r) => [r.provider, Number(r.monthly_usd)]));
    const names = [...new Set([...PROVIDERS, ...s.keys()])];
    return names.map((provider) => ({
      provider,
      spentUsd: Number(s.get(provider)?.usd ?? 0),
      calls: s.get(provider)?.calls ?? 0,
      budgetUsd: b.get(provider) ?? fallbackBudget,
    }));
  });
}

export interface JobRunRow {
  id: number;
  job_name: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
  stats: Record<string, unknown>;
}

export function getJobRuns(limit = 20): Promise<Result<JobRunRow[]>> {
  return query(
    (sql) => sql<JobRunRow[]>`
      select id::int, job_name, status::text as status, started_at, finished_at, error, stats
      from public.job_runs order by started_at desc limit ${limit}`,
  );
}

export function getEnvStatus(): EnvKeyStatus[] {
  return envStatus();
}


export interface SourceUsage {
  apifyUsd: number;
  apifyBudget: number;
  serpapiMonth: number;
  searchapiTotal: number;
  scrapecreatorsTotal: number;
  socialcrawlTotal: number;
  adyntelTotal: number;
  metapiMonth: number;
  socialfetchTotal: number;
  brightdataTotal: number;
  parseTotal: number;
  adspoTotal: number;
  geminiToday: number;
  groqToday: number;
  openrouterToday: number;
  voyageTokens: number;
}

export function getSourceUsage(): Promise<Result<SourceUsage>> {
  return query(async (sql) => {
    const month = sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`;
    const [r] = await sql<Record<string, string | number | null>[]>`
      select
        coalesce((select sum(usd) from public.cost_ledger where provider = 'apify' and created_at >= ${month}), 0)::text as apify,
        (select monthly_usd::text from public.provider_budgets where provider = 'apify') as budget,
        coalesce((select sum(units) from public.cost_ledger where provider = 'serpapi' and created_at >= ${month}), 0)::int as serp,
        coalesce((select sum(units) from public.cost_ledger where provider = 'searchapi'), 0)::int as search,
        coalesce((select sum(units) from public.cost_ledger where provider = 'scrapecreators'), 0)::int as sc,
        coalesce((select sum(units) from public.cost_ledger where provider = 'socialcrawl'), 0)::int as scrawl,
        coalesce((select sum(units) from public.cost_ledger where provider = 'adyntel'), 0)::int as adyntel,
        coalesce((select sum(units) from public.cost_ledger where provider = 'metapi' and created_at >= ${month}), 0)::int as metapi,
        coalesce((select sum(units) from public.cost_ledger where provider = 'socialfetch'), 0)::int as sfetch,
        coalesce((select sum(units) from public.cost_ledger where provider = 'brightdata'), 0)::int as bdata,
        coalesce((select sum(units) from public.cost_ledger where provider = 'parsebot'), 0)::int as parse,
        coalesce((select sum(units) from public.cost_ledger where provider = 'adspo'), 0)::int as adspo,
        coalesce((select count(*) from public.cost_ledger where provider = 'gemini' and created_at > now() - interval '24 hours'), 0)::int as gemini,
        coalesce((select count(*) from public.cost_ledger where provider = 'groq' and created_at > now() - interval '24 hours'), 0)::int as groq,
        coalesce((select count(*) from public.cost_ledger where provider = 'openrouter' and created_at > now() - interval '24 hours'), 0)::int as openrouter,
        coalesce((select sum(units) from public.cost_ledger where provider = 'voyage'), 0)::bigint::text as voyage`;
    const n = (k: string) => Number(r?.[k] ?? 0);
    return {
      apifyUsd: n("apify"),
      apifyBudget: n("budget"),
      serpapiMonth: n("serp"),
      searchapiTotal: n("search"),
      scrapecreatorsTotal: n("sc"),
      socialcrawlTotal: n("scrawl"),
      adyntelTotal: n("adyntel"),
      metapiMonth: n("metapi"),
      socialfetchTotal: n("sfetch"),
      brightdataTotal: n("bdata"),
      parseTotal: n("parse"),
      adspoTotal: n("adspo"),
      geminiToday: n("gemini"),
      groqToday: n("groq"),
      openrouterToday: n("openrouter"),
      voyageTokens: n("voyage"),
    };
  });
}

export interface TrackingOverview {
  tracked: number;
  newThisWeek: number;
  liveCreatives: number;
  winners: number;
}

/** Headline numbers across the brands you track (one count per unique creative). */
export function getTrackingOverview(): Promise<Result<TrackingOverview>> {
  return query(async (sql) => {
    const [r] = await sql<TrackingOverview[]>`
      select
        (select count(*) from public.brands where status = 'tracked' and merged_into is null)::int as tracked,
        count(distinct coalesce(a.creative_group, a.id::text)) filter (where a.start_date >= current_date - 7)::int as "newThisWeek",
        count(distinct coalesce(a.creative_group, a.id::text)) filter (where a.is_active)::int as "liveCreatives",
        count(distinct coalesce(a.creative_group, a.id::text)) filter (where a.is_active and a.days_running >= 30)::int as winners
      from public.ads a join public.brands b on b.id = a.brand_id
      where b.status = 'tracked'`;
    return r ?? { tracked: 0, newThisWeek: 0, liveCreatives: 0, winners: 0 };
  });
}
