-- Visual duplicate detection: 64-bit dHash of each ad's thumbnail, and the resulting creative group
-- (ads of the same brand whose thumbnails are near-identical). The feed shows one tile per group.
alter table public.ads add column if not exists thumb_hash text;
alter table public.ads add column if not exists creative_group text;
create index if not exists ads_brand_creative_group_idx on public.ads (brand_id, creative_group);
create index if not exists ads_thumb_hash_todo_idx on public.ads (id) where thumb_hash is null;
