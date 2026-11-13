import { loadRootEnv } from "@signal/shared/env-file";
import { createSql, fromPostgresJs } from "@signal/shared/db";
import { dedupeCreatives } from "@signal/shared/media";

/** Re-group every ad into creatives (thumbnail fingerprint + identical copy). Free, re-runnable. */
loadRootEnv();
const sql = createSql(process.env.DATABASE_URL!, { max: 2 });
const before = await sql`select count(distinct coalesce(creative_group, id::text))::int n from public.ads`;
const r = await dedupeCreatives(fromPostgresJs(sql), { concurrency: 8, log: console.log });
const after = await sql`select count(distinct coalesce(creative_group, id::text))::int n from public.ads`;
console.log(`ads ${r.ads}: creatives ${before[0]!.n} -> ${after[0]!.n} (hashed ${r.hashed}, failed ${r.failed})`);
await sql.end();
