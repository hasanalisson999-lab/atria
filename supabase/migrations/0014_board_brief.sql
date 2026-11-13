-- AI read of a board: what the saved ads have in common + concepts for our brand.
alter table public.boards add column if not exists ai_brief text;
alter table public.boards add column if not exists ai_brief_at timestamptz;
