-- A brand can own several Facebook pages (regional pages like Mizuno Europe / USA / Brazil).
-- Secondary pages point at the main brand; their ads are stored under the main brand.
alter table public.brands add column if not exists merged_into uuid references public.brands (id) on delete set null;
create index if not exists brands_merged_into_idx on public.brands (merged_into) where merged_into is not null;

-- Cache for paid-per-call lookups (brand/page search), so the same query never spends credits twice.
create table if not exists public.search_cache (
  key         text primary key,
  provider    text not null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.search_cache enable row level security;
