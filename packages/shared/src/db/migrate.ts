import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "./client.ts";

export interface Migration {
  name: string;
  sql: string;
}

export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

const TRACKING_TABLE = `create table if not exists public.signal_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`;

/** Applies pending migrations, each in its own transaction. Returns the names applied. */
export async function migratePostgres(sql: Sql, migrations: Migration[], log: (m: string) => void = console.log): Promise<string[]> {
  await sql.unsafe(TRACKING_TABLE);
  const done = new Set((await sql.unsafe<{ name: string }[]>("select name from public.signal_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    log(`applying ${m.name}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(m.sql);
      await tx.unsafe("insert into public.signal_migrations (name) values ($1)", [m.name]);
    });
    applied.push(m.name);
  }
  return applied;
}

/** Same, for PGlite (tests). */
export async function migratePglite(
  db: { exec(sql: string): Promise<unknown>; query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; transaction<T>(fn: (tx: { exec(sql: string): Promise<unknown>; query(sql: string, params?: unknown[]): Promise<unknown> }) => Promise<T>): Promise<T> },
  migrations: Migration[],
): Promise<string[]> {
  await db.exec(TRACKING_TABLE);
  const done = new Set((await db.query<{ name: string }>("select name from public.signal_migrations")).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into public.signal_migrations (name) values ($1)", [m.name]);
    });
    applied.push(m.name);
  }
  return applied;
}
