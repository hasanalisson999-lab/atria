-- One creative = one visual asset. Meta CDN URLs change their signed query string, but the file
-- name (e.g. 346767801_2718..._n.jpg) is the asset id, identical across duplicate ads. Grouping by
-- brand + asset collapses copies of the same image/video into one tile with an "N variants" count.
alter table public.ads add column if not exists creative_key text generated always as (
  coalesce(
    nullif(regexp_replace(split_part(thumbnail_url, '?', 1), '^.*/', ''), ''),
    nullif(regexp_replace(split_part(video_url, '?', 1), '^.*/', ''), ''),
    creative_hash,
    source_ad_id
  )
) stored;
create index if not exists ads_brand_creative_key_idx on public.ads (brand_id, creative_key);
