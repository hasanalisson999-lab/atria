import postgres from "postgres";

/**
 * Minimal query interface so repositories run on postgres.js in production and on PGlite in tests.
 * All SQL in repositories is parameterized ($1, $2, ...).
 */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export type Sql = ReturnType<typeof postgres>;

export function createSql(databaseUrl: string, opts: { max?: number; appName?: string } = {}): Sql {
  return postgres(databaseUrl, {
    max: opts.max ?? 5,
    // Supabase poolers don't support prepared statements in transaction mode; harmless in session mode.
    prepare: false,
    // Never pipeline several queries on one connection: Supabase's transaction pooler (port 6543, used in
    // production) hangs or cancels pipelined queries. Extra queries wait for a free connection instead.
    max_pipeline: 1,
    idle_timeout: 30,
    connect_timeout: 15,
    connection: { application_name: opts.appName ?? "signal" },
    onnotice: () => {},
  });
}

export function fromPostgresJs(sql: Sql): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
  };
}

/** Structural type for PGlite so the shared package doesn't depend on it at runtime. */
interface PGliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function fromPglite(db: PGliteLike): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await db.query<T>(text, params)).rows;
    },
  };
}
