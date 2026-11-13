-- Shorter, sharper AI breakdowns: one-line takeaway for our brand + schema version.
alter table public.ad_analysis add column if not exists takeaway text;
alter table public.ad_analysis add column if not exists version int not null default 1;
