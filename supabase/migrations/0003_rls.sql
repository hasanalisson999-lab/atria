-- Signal: row level security
-- The worker connects as the service role / postgres owner and bypasses RLS.
-- Signed-in users read the shared catalog and manage only their own rows.
-- The anon role gets nothing.

alter table public.brands            enable row level security;
alter table public.user_brands       enable row level security;
alter table public.brand_snapshots   enable row level security;
alter table public.ads               enable row level security;
alter table public.ad_media          enable row level security;
alter table public.ad_analysis       enable row level security;
alter table public.ad_embeddings     enable row level security;
alter table public.brand_embeddings  enable row level security;
alter table public.keywords          enable row level security;
alter table public.boards            enable row level security;
alter table public.board_items       enable row level security;
alter table public.cost_ledger       enable row level security;
alter table public.provider_budgets  enable row level security;
alter table public.job_runs          enable row level security;

-- Catalog: read-only for signed-in users.
create policy "catalog read" on public.brands           for select to authenticated using (true);
create policy "catalog read" on public.brand_snapshots  for select to authenticated using (true);
create policy "catalog read" on public.ads              for select to authenticated using (true);
create policy "catalog read" on public.ad_media         for select to authenticated using (true);
create policy "catalog read" on public.ad_analysis      for select to authenticated using (true);
create policy "catalog read" on public.ad_embeddings    for select to authenticated using (true);
create policy "catalog read" on public.brand_embeddings for select to authenticated using (true);

-- Ops data: readable by signed-in users (single-tenant dashboard), written by the worker only.
create policy "ops read" on public.cost_ledger      for select to authenticated using (true);
create policy "ops read" on public.job_runs         for select to authenticated using (true);
create policy "ops read" on public.provider_budgets for select to authenticated using (true);

-- Owner-scoped tables.
create policy "own rows" on public.user_brands for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own boards" on public.boards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own board items" on public.board_items for all to authenticated
  using (exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()));

-- Keywords: system/seed rows (user_id null) are visible to everyone signed in; edits only on own rows.
create policy "keywords read" on public.keywords for select to authenticated
  using (user_id is null or user_id = auth.uid());
create policy "keywords write own" on public.keywords for insert to authenticated
  with check (user_id = auth.uid());
create policy "keywords update own" on public.keywords for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "keywords delete own" on public.keywords for delete to authenticated
  using (user_id = auth.uid());
