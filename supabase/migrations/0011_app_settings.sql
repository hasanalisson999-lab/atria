-- Small key/value store for app-level settings (e.g. the Oneletic brand profile used by AI Studio).
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
