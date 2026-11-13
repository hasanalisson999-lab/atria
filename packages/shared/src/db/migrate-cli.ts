import { dirname, join } from "node:path";
import { requireEnv } from "../env.ts";
import { loadRootEnv } from "../env-file.ts";
import { createSql } from "./client.ts";
import { loadMigrations, migratePostgres } from "./migrate.ts";

const envFile = loadRootEnv();
if (!envFile) console.warn("No repo-root .env found; using process environment.");
const { DATABASE_URL } = requireEnv(["DATABASE_URL"]);
const repoRoot = envFile ? dirname(envFile) : join(import.meta.dirname, "../../../..");

const sql = createSql(DATABASE_URL, { max: 1, appName: "signal-migrate" });
try {
  const applied = await migratePostgres(sql, loadMigrations(join(repoRoot, "supabase/migrations")));
  console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Database is up to date.");
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
