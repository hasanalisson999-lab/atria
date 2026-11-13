-- Which creatives the Discover feed has already shown, so each visit deals a fresh batch.
create table if not exists public.feed_impressions (
  grp        text primary key,
  shown_at   timestamptz not null default now(),
  times      int not null default 1
);
alter table public.feed_impressions enable row level security;
