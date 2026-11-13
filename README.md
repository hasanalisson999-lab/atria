# Atria

Personal ad-intelligence platform (working name Atria) (Atria/Foreplay-style) for fitness, activewear and supplements.

```
apps/web         Next.js 16 (App Router) + Tailwind 4 + shadcn/ui: the UI
apps/worker      pg-boss worker: scheduled discovery jobs, media pipeline (ffmpeg in Docker)
apps/extension   Chrome extension (Phase 3)
packages/shared  env checks, types, AdSource interface, Apify source + normalizers, cost ledger, DB repos, R2
scripts          one-off tools (source benchmark)
supabase/migrations  SQL schema (applied with npm run db:migrate)
```

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in (secrets stay out of git).
3. `npm run db:migrate` applies the schema, RLS and seed keywords to Supabase.
4. `npm run dev` starts the web app on http://localhost:3000 and the worker.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Web + worker in watch mode |
| `npm test` | Unit + DB tests (PGlite: real Postgres in-process, no network) |
| `npm run typecheck` | TypeScript across all packages |
| `npm run db:migrate` | Apply pending migrations |
| `npm run benchmark` | Show the scraper benchmark plan + cost estimate (spends nothing) |
| `npm run benchmark -- --confirm` | Run the benchmark (cost-capped, logged to the cost ledger) |

## Guardrails

- Every paid call goes through `CostLedger`: a per-provider monthly budget (`MONTHLY_BUDGET_USD`, with overrides
  in `provider_budgets`) is a hard stop, and any single action estimated above $5 needs explicit approval.
- Ingestion is upsert-only on `(source, source_ad_id)`, so re-running a job never duplicates.
- Only public, logged-out Ad Library data is collected.
