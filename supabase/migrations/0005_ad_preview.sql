-- Preview URLs for the feed (all ads). These are the source CDN URLs and expire after some days;
-- winners get permanent copies in R2 via ad_media (Phase 2). Each crawl refreshes them.
alter table public.ads add column if not exists thumbnail_url text;
alter table public.ads add column if not exists video_url text;
alter table public.ads add column if not exists media_count integer not null default 0;

-- Feed sort indexes.
create index if not exists ads_last_seen_idx on public.ads (last_seen_at desc);
create index if not exists ads_variations_idx on public.ads (variations_count desc);
