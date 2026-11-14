import "server-only";
import { envStatus } from "@signal/shared/env";
import { createSql, type Sql } from "@signal/shared/db";

/**
 * Server-side Postgres access. Uses DATABASE_URL (server only — never sent to the browser).
 * Returns null when the URL is missing or still has the [YOUR-PASSWORD] placeholder so pages can
 * render a clear setup state instead of crashing.
 */
const globalForDb = globalThis as unknown as { __signalSql?: Sql };

export type DbUnavailable = { ok: false; reason: string };

export function getSql(): Sql | DbUnavailable {
  const st = envStatus().find((s) => s.key === "DATABASE_URL")!;
  if (st.state === "missing") return { ok: false, reason: "DATABASE_URL is not set in .env" };
  if (st.state === "invalid") return { ok: false, reason: `DATABASE_URL ${st.reason} — add your Supabase database password to .env` };
  globalForDb.__signalSql ??= createSql(process.env.DATABASE_URL!, { max: 3, appName: "signal-web" });
  return globalForDb.__signalSql;
}

export const isUnavailable = (v: unknown): v is DbUnavailable => typeof v === "object" && v !== null && (v as DbUnavailable).ok === false;

const globalForBg = globalThis as unknown as { __signalBgSql?: Sql };

/**
 * A separate, small pool for background work (after() refreshes, brand syncs, seeding). Those jobs wait on
 * slow ad providers for minutes; on their own pool they can never take the connections pages need, so a
 * page never sits on "Loading" behind them.
 */
export function getBackgroundSql(): Sql | DbUnavailable {
  const main = getSql();
  if (isUnavailable(main)) return main;
  globalForBg.__signalBgSql ??= createSql(process.env.DATABASE_URL!, { max: 2, appName: "signal-web-bg" });
  return globalForBg.__signalBgSql;
}

/** Resolves when `work` finishes or after `ms`, whichever comes first, so background jobs never hit the platform's time limit. */
export function withBudget<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([work, new Promise<undefined>((r) => setTimeout(r, ms))]);
}

export type Result<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Runs a query function and converts every failure mode into a Result. */
export async function query<T>(fn: (sql: Sql) => Promise<T>): Promise<Result<T>> {
  const sql = getSql();
  if (isUnavailable(sql)) return sql;
  try {
    return { ok: true, data: await fn(sql) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(msg)) return { ok: false, reason: "Database is reachable but not migrated yet — run `npm run db:migrate`." };
    if (/password authentication failed/i.test(msg)) return { ok: false, reason: "Database password in DATABASE_URL is wrong." };
    if (/ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) return { ok: false, reason: `Can't reach the database (${msg.slice(0, 80)}).` };
    return { ok: false, reason: msg.slice(0, 200) };
  }
}
