// Prints the saved Brand Lab sections (used to review output quality).
import postgres from "postgres";
import { loadRootEnv } from "@signal/shared/env-file";

loadRootEnv();
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const key = process.argv[2] ?? "lab:scripts";
const rows = await sql<{ key: string; value: unknown }[]>`select key, value from public.app_settings where key like ${key}`;
for (const r of rows) console.log(r.key, JSON.stringify(r.value, null, 1).slice(0, Number(process.argv[3] ?? 6000)));
await sql.end();
