-- Single-user mode (no sign-in yet): boards may exist without an owner. RLS still protects them
-- once auth is added (owner-scoped policy); the server uses the service connection meanwhile.
alter table public.boards alter column user_id drop not null;
alter table public.boards add column if not exists description text;
alter table public.boards add column if not exists color text not null default 'pink';
create unique index if not exists boards_name_unique on public.boards (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- AI brand strategy (Gemini free tier), regenerated on demand.
alter table public.brands add column if not exists ai_profile jsonb;

-- Fast typeahead over brand names, aliases and domains.
create index if not exists brands_aliases_idx on public.brands using gin (aliases);
create index if not exists ads_headline_trgm_idx on public.ads using gin (headline extensions.gin_trgm_ops);
