import { loadRootEnv } from "@signal/shared/env-file";
import { fromPostgresJs, createSql } from "@signal/shared/db";
import { generate, keysFromEnv, listFreeModels } from "@signal/shared/ai";

loadRootEnv();
const keys = keysFromEnv();
const models = await listFreeModels(keys, { refresh: true });
console.log("ranked free models (top 10):");
for (const m of models.slice(0, 10)) console.log(`  ${m.score.toString().padStart(5)}  ${m.provider.padEnd(10)} ${m.id}${m.vision ? "  [vision]" : ""}`);
const sql = createSql(process.env.DATABASE_URL!, { max: 1 });
const db = fromPostgresJs(sql);
for (const mode of ["gemini", "fallback"] as const) {
  const t = Date.now();
  const r = await generate(keys, db, { prompt: "Write one 8-word hook for a running shoe ad. Reply with the hook only.", operation: "check", skipGemini: mode === "fallback", maxTokens: 400 });
  console.log(`${mode}: ${r.provider}/${r.model} in ${Date.now() - t}ms -> ${r.text.trim().slice(0, 120)}`);
}
await sql.end();
