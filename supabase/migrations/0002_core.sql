-- Signal: core schema
--
-- Two kinds of tables:
--   * Catalog tables (brands, ads, media, analysis, embeddings, snapshots) hold public ad data
--     shared by every user. Only the worker (service role) writes them.
--   * User tables (user_brands, keywords, boards, budgets) carry user_id and are owner-scoped
--     by RLS (see 0003_rls.sql). Rows with user_id NULL are system/seed rows.

-- ---------------------------------------------------------------- enums
create type ad_format      as enum ('image', 'video', 'carousel', 'dco', 'unknown');
create type media_status   as enum ('none', 'queued', 'stored', 'failed');
create type brand_status   as enum ('discovered', 'tracked', 'ignored');
create type keyword_source as enum ('seed', 'ai_suggested', 'manual');
create type keyword_status as enum ('active', 'pending', 'paused');
create type job_status     as enum ('running', 'succeeded', 'failed');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- brands
create table public.brands (
  id                uuid primary key default gen_random_uuid(),
  platform          text not null default 'meta',
  platform_page_id  text not null,
  name              text not null,
  website_domain    text,
  logo_url          text,
  category          text,
  subcategory       text,
  is_shopify        boolean,
  countries         text[] not null default '{}',
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  active_ads_count  integer not null default 0,
  ai_summary        text,
  ai_summary_at     timestamptz,
  enriched_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (platform, platform_page_id)
);
create index brands_category_idx      on public.brands (category, subcategory);
create index brands_first_seen_idx    on public.brands (first_seen_at desc);
create index brands_active_ads_idx    on public.brands (active_ads_count desc);
create index brands_name_trgm_idx     on public.brands using gin (name extensions.gin_trgm_ops);
create index brands_domain_idx        on public.brands (website_domain);
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- Per-user brand status. "discovered" is the implicit default (no row).
create table public.user_brands (
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  brand_id    uuid not null references public.brands (id) on delete cascade,
  status      brand_status not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, brand_id)
);
create index user_brands_status_idx on public.user_brands (status, brand_id);
create trigger user_brands_updated_at before update on public.user_brands
  for each row execute function public.set_updated_at();

-- Daily brand snapshot (powers "Rising").
create table public.brand_snapshots (
  brand_id           uuid not null references public.brands (id) on delete cascade,
  date               date not null,
  active_ads_count   integer not null default 0,
  new_ads_count      integer not null default 0,
  stopped_ads_count  integer not null default 0,
  primary key (brand_id, date)
);
create index brand_snapshots_date_idx on public.brand_snapshots (date desc);

-- ---------------------------------------------------------------- ads
create table public.ads (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,
  source_ad_id      text not null,
  brand_id          uuid references public.brands (id) on delete set null,
  platforms         text[] not null default '{}',
  format            ad_format not null default 'unknown',
  body_text         text,
  headline          text,
  description       text,
  cta               text,
  landing_url       text,
  landing_domain    text,
  countries         text[] not null default '{}',
  start_date        date,
  end_date          date,
  is_active         boolean not null default true,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  -- Days between start and stop (or the last time we saw it running). Stored so it is indexable.
  days_running      integer generated always as (
                      coalesce(end_date, (last_seen_at at time zone 'UTC')::date) - start_date
                    ) stored,
  creative_hash     text,
  collation_id      text,
  variations_count  integer not null default 1,
  is_winner         boolean not null default false,
  winner_score      numeric(5, 2) not null default 0,
  winner_reasons    text[] not null default '{}',
  media_status      media_status not null default 'none',
  force_process     boolean not null default false,
  raw               jsonb,
  search_tsv        tsvector generated always as (
                      to_tsvector('simple'::regconfig,
                        coalesce(headline, '') || ' ' || coalesce(body_text, '') || ' ' || coalesce(description, ''))
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source, source_ad_id)
);
create index ads_brand_idx          on public.ads (brand_id);
create index ads_active_idx         on public.ads (is_active) where is_active;
create index ads_days_running_idx   on public.ads (days_running desc nulls last);
create index ads_start_date_idx     on public.ads (start_date desc nulls last);
create index ads_format_idx         on public.ads (format);
create index ads_winner_idx         on public.ads (winner_score desc) where is_winner;
create index ads_creative_hash_idx  on public.ads (creative_hash);
create index ads_media_status_idx   on public.ads (media_status) where media_status in ('queued', 'failed');
create index ads_landing_domain_idx on public.ads (landing_domain);
create index ads_countries_idx      on public.ads using gin (countries);
create index ads_platforms_idx      on public.ads using gin (platforms);
create index ads_search_idx         on public.ads using gin (search_tsv);
create trigger ads_updated_at before update on public.ads
  for each row execute function public.set_updated_at();

create table public.ad_media (
  id                uuid primary key default gen_random_uuid(),
  ad_id             uuid not null references public.ads (id) on delete cascade,
  type              text not null check (type in ('image', 'video')),
  position          integer not null default 0,
  r2_key            text,
  source_url        text,
  width             integer,
  height            integer,
  duration_s        numeric(8, 2),
  phash             text,
  thumbnail_r2_key  text,
  created_at        timestamptz not null default now(),
  unique (ad_id, type, position)
);
create index ad_media_ad_idx on public.ad_media (ad_id);

create table public.ad_analysis (
  ad_id             uuid primary key references public.ads (id) on delete cascade,
  transcript        text,
  hook_text         text,
  hook_type         text,
  angle             text,
  awareness_level   text,
  format_tags       text[] not null default '{}',
  emotions          text[] not null default '{}',
  offer             text,
  target_audience   text,
  script_breakdown  jsonb,
  why_it_works      text,
  model             text,
  cost_usd          numeric(10, 5) not null default 0,
  created_at        timestamptz not null default now()
);

-- Voyage AI embeddings are 1024-dimensional by default (voyage-3.5 / voyage-3-large).
create table public.ad_embeddings (
  ad_id       uuid primary key references public.ads (id) on delete cascade,
  embedding   extensions.vector(1024) not null,
  model       text not null,
  created_at  timestamptz not null default now()
);
create index ad_embeddings_hnsw on public.ad_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.brand_embeddings (
  brand_id    uuid primary key references public.brands (id) on delete cascade,
  embedding   extensions.vector(1024) not null,
  model       text not null,
  created_at  timestamptz not null default now()
);
create index brand_embeddings_hnsw on public.brand_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------- discovery config
create table public.keywords (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete cascade default auth.uid(),
  term              text not null,
  country           text not null,
  source            keyword_source not null default 'manual',
  status            keyword_status not null default 'active',
  last_run_at       timestamptz,
  total_ads_found   integer not null default 0,
  new_brands_found  integer not null default 0,
  last_new_brand_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index keywords_unique_idx on public.keywords
  (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(term), country);
create index keywords_status_idx on public.keywords (status);
create trigger keywords_updated_at before update on public.keywords
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- boards
create table public.boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index boards_user_idx on public.boards (user_id);
create trigger boards_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

create table public.board_items (
  board_id  uuid not null references public.boards (id) on delete cascade,
  ad_id     uuid not null references public.ads (id) on delete cascade,
  note      text,
  added_at  timestamptz not null default now(),
  primary key (board_id, ad_id)
);
create index board_items_ad_idx on public.board_items (ad_id);

-- ---------------------------------------------------------------- cost control + ops
create table public.cost_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  provider    text not null,
  operation   text not null,
  units       numeric(14, 4) not null default 0,
  usd         numeric(12, 6) not null default 0,
  job_id      text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index cost_ledger_provider_month_idx on public.cost_ledger (provider, created_at desc);

-- Per-provider monthly budget overrides. Missing provider => MONTHLY_BUDGET_USD.
create table public.provider_budgets (
  provider     text primary key,
  monthly_usd  numeric(10, 2) not null check (monthly_usd >= 0),
  updated_at   timestamptz not null default now()
);

create table public.job_runs (
  id           bigint generated always as identity primary key,
  job_name     text not null,
  job_id       text,
  status       job_status not null default 'running',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  stats        jsonb not null default '{}'::jsonb,
  error        text
);
create index job_runs_name_idx on public.job_runs (job_name, started_at desc);
create index job_runs_failed_idx on public.job_runs (started_at desc) where status = 'failed';
