import type { Queryable } from "../db/client.ts";

/**
 * Every paid call goes through the CostLedger:
 *   1. guard()  — refuses when the provider's monthly budget would be exceeded (hard stop), and
 *                 requires explicit approval for any single action estimated above the threshold.
 *   2. record() — logs provider, operation, units and USD actually spent.
 */

export type Provider = "apify" | "meta" | "anthropic" | "voyage" | "elevenlabs" | "openai" | "r2";

export interface LedgerEntry {
  provider: Provider | string;
  operation: string;
  units: number;
  usd: number;
  jobId?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface LedgerStore {
  spentThisMonth(provider: string, now: Date): Promise<number>;
  spentByProviderThisMonth(now: Date): Promise<Record<string, number>>;
  budgetOverride(provider: string): Promise<number | null>;
  insert(entry: LedgerEntry): Promise<void>;
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly provider: string,
    public readonly spentUsd: number,
    public readonly budgetUsd: number,
    public readonly estimateUsd: number,
  ) {
    super(
      `Monthly budget reached for ${provider}: spent $${spentUsd.toFixed(2)} of $${budgetUsd.toFixed(2)}; ` +
        `this action needs ~$${estimateUsd.toFixed(2)}. Raise the budget in Settings to continue.`,
    );
    this.name = "BudgetExceededError";
  }
}

export class ApprovalRequiredError extends Error {
  constructor(
    public readonly provider: string,
    public readonly operation: string,
    public readonly estimateUsd: number,
    public readonly thresholdUsd: number,
  ) {
    super(`${provider}/${operation} is estimated at $${estimateUsd.toFixed(2)}, above the $${thresholdUsd.toFixed(2)} approval threshold. Re-run with explicit approval.`);
    this.name = "ApprovalRequiredError";
  }
}

export interface LedgerOptions {
  defaultMonthlyBudgetUsd: number;
  approvalThresholdUsd?: number;
  now?: () => Date;
}

export interface BudgetStatus {
  provider: string;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  exhausted: boolean;
}

export class CostLedger {
  private readonly threshold: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: LedgerStore,
    private readonly opts: LedgerOptions,
  ) {
    this.threshold = opts.approvalThresholdUsd ?? 5;
    this.now = opts.now ?? (() => new Date());
  }

  async budgetFor(provider: string): Promise<number> {
    return (await this.store.budgetOverride(provider)) ?? this.opts.defaultMonthlyBudgetUsd;
  }

  async status(provider: string): Promise<BudgetStatus> {
    const [spentUsd, budgetUsd] = await Promise.all([this.store.spentThisMonth(provider, this.now()), this.budgetFor(provider)]);
    const remainingUsd = Math.max(0, budgetUsd - spentUsd);
    return { provider, spentUsd, budgetUsd, remainingUsd, exhausted: spentUsd >= budgetUsd };
  }

  /** Throws if the action may not run. Call before every paid request. */
  async guard(provider: string, operation: string, estimateUsd: number, opts: { approved?: boolean } = {}): Promise<BudgetStatus> {
    if (estimateUsd > this.threshold && !opts.approved) {
      throw new ApprovalRequiredError(provider, operation, estimateUsd, this.threshold);
    }
    const st = await this.status(provider);
    if (st.spentUsd + estimateUsd > st.budgetUsd) {
      throw new BudgetExceededError(provider, st.spentUsd, st.budgetUsd, estimateUsd);
    }
    return st;
  }

  async record(entry: LedgerEntry): Promise<void> {
    if (!Number.isFinite(entry.usd) || entry.usd < 0) throw new Error(`Invalid usd amount: ${entry.usd}`);
    await this.store.insert(entry);
  }

  /** guard → run → record the actual cost reported by the call. */
  async track<T>(
    provider: string,
    operation: string,
    estimateUsd: number,
    fn: () => Promise<{ result: T; units: number; usd: number; meta?: Record<string, unknown> }>,
    opts: { approved?: boolean; jobId?: string | null } = {},
  ): Promise<T> {
    await this.guard(provider, operation, estimateUsd, opts);
    const { result, units, usd, meta } = await fn();
    await this.record({ provider, operation, units, usd, jobId: opts.jobId ?? null, meta: meta ?? null });
    return result;
  }
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class PostgresLedgerStore implements LedgerStore {
  constructor(private readonly db: Queryable) {}

  async spentThisMonth(provider: string, now: Date): Promise<number> {
    const [row] = await this.db.query<{ usd: string | number | null }>(
      "select coalesce(sum(usd), 0) as usd from public.cost_ledger where provider = $1 and created_at >= $2",
      [provider, monthStart(now).toISOString()],
    );
    return Number(row?.usd ?? 0);
  }

  async spentByProviderThisMonth(now: Date): Promise<Record<string, number>> {
    const rows = await this.db.query<{ provider: string; usd: string | number }>(
      "select provider, coalesce(sum(usd), 0) as usd from public.cost_ledger where created_at >= $1 group by provider",
      [monthStart(now).toISOString()],
    );
    return Object.fromEntries(rows.map((r) => [r.provider, Number(r.usd)]));
  }

  async budgetOverride(provider: string): Promise<number | null> {
    const [row] = await this.db.query<{ monthly_usd: string | number }>("select monthly_usd from public.provider_budgets where provider = $1", [provider]);
    return row ? Number(row.monthly_usd) : null;
  }

  async insert(e: LedgerEntry): Promise<void> {
    await this.db.query(
      "insert into public.cost_ledger (provider, operation, units, usd, job_id, user_id, meta) values ($1, $2, $3, $4, $5, $6, $7::text::jsonb)",
      [e.provider, e.operation, e.units, e.usd, e.jobId ?? null, e.userId ?? null, e.meta ? JSON.stringify(e.meta) : null],
    );
  }
}

/** In-memory store for tests and dry runs. */
export class MemoryLedgerStore implements LedgerStore {
  entries: (LedgerEntry & { createdAt: Date })[] = [];
  overrides = new Map<string, number>();
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async spentThisMonth(provider: string, now: Date) {
    const from = monthStart(now).getTime();
    return this.entries.filter((e) => e.provider === provider && e.createdAt.getTime() >= from).reduce((s, e) => s + e.usd, 0);
  }
  async spentByProviderThisMonth(now: Date) {
    const from = monthStart(now).getTime();
    const out: Record<string, number> = {};
    for (const e of this.entries) if (e.createdAt.getTime() >= from) out[e.provider] = (out[e.provider] ?? 0) + e.usd;
    return out;
  }
  async budgetOverride(provider: string) {
    return this.overrides.get(provider) ?? null;
  }
  async insert(entry: LedgerEntry) {
    this.entries.push({ ...entry, createdAt: this.clock() });
  }
}
