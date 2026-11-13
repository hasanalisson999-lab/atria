-- Challenger vs. major brands (Discover spotlights newer brands), and a price pulled from the ad copy.
alter table public.brands add column if not exists tier text;
alter table public.ads add column if not exists price numeric
  generated always as (((regexp_match(coalesce(headline, '') || ' ' || coalesce(body_text, ''), '[$£€]\s?(\d{1,4})(?:[.,]\d{2})?'))[1])::numeric) stored;
create index if not exists ads_price_idx on public.ads (price) where price is not null;
create index if not exists brands_tier_idx on public.brands (tier);
