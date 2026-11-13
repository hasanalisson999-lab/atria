import { loadRootEnv } from "@signal/shared/env-file";
import { createSql, fromPostgresJs } from "@signal/shared/db";
import { embedMissingAds } from "@signal/shared/ai";

/** Backfill semantic embeddings for every creative (Voyage free tokens). Re-runnable. */
loadRootEnv();
const key = process.env.VOYAGE_API_KEY;
if (!key) throw new Error("VOYAGE_API_KEY missing");
const sql = createSql(process.env.DATABASE_URL!, { max: 1 });
const t = Date.now();
const n = await embedMissingAds(key, fromPostgresJs(sql), { batch: Number(process.env.BATCH ?? 32), onProgress: (d, total) => console.log(`embedded ${d}/${total}`) });
console.log(`done: ${n} creatives in ${Math.round((Date.now() - t) / 1000)}s`);
await sql.end();
