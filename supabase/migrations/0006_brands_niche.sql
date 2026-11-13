-- Brand quality + niche + tracking status (single-user mode; per-user status lives in user_brands later).
alter table public.brands add column if not exists status brand_status not null default 'discovered';
alter table public.brands add column if not exists tracked_at timestamptz;
alter table public.brands add column if not exists page_likes integer;
alter table public.brands add column if not exists page_category text;
alter table public.brands add column if not exists is_curated boolean not null default false;
-- 'brand' = real brand (curated, or large audience), 'dropship' = generic/dropshipping store, 'unknown' = not judged yet.
alter table public.brands add column if not exists quality text not null default 'unknown' check (quality in ('brand', 'dropship', 'unknown'));
alter table public.brands add column if not exists aliases text[] not null default '{}';
alter table public.brands add column if not exists ads_synced_at timestamptz;

create index if not exists brands_status_idx on public.brands (status) where status <> 'discovered';
create index if not exists brands_quality_category_idx on public.brands (quality, category);

-- Footwear is the primary niche: add footwear keywords (US + GB + DE for EU coverage).
insert into public.keywords (user_id, term, country, source, status)
select null, t.term, c.country, 'seed', 'active'
from unnest(array[
  'running shoes', 'trail running shoes', 'barefoot shoes', 'sneakers', 'walking shoes',
  'cushioned running shoes', 'recovery slides', 'gym shoes', 'lifting shoes', 'carbon plate running shoes'
]) as t(term)
cross join unnest(array['US', 'GB', 'DE']) as c(country)
on conflict do nothing;
