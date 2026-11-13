// Runs the Brand Lab slop detector over a saved section (default: scripts) and prints every hit.
import postgres from "postgres";
import { loadRootEnv } from "@signal/shared/env-file";
import { detectFields, detectSlop, textFields } from "../../apps/web/src/lib/slop.ts";

loadRootEnv();
const key = process.argv[2] ?? "lab:scripts";
if (key === "--text") {
  for (const h of detectSlop(process.argv.slice(3).join(" "))) console.log(`${h.label}: "${h.match}"`);
  process.exit(0);
}
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const [row] = await sql<{ value: { data: Record<string, unknown> } }[]>`select value from public.app_settings where key = ${key}`;
await sql.end();
if (!row) throw new Error("not found");
const data = row.value.data;
const pieces: [string, unknown][] = key === "lab:scripts" ? ((data.scripts as unknown[]) ?? []).map((s, i) => [`script ${i}`, s]) : [[key, data]];
let total = 0;
for (const [name, piece] of pieces) {
  const hits = detectFields(textFields(piece));
  total += hits.length;
  console.log(`\n== ${name}: ${(piece as { title?: string }).title ?? ""} (${hits.length})`);
  for (const h of hits) console.log(`  ${h.severity === "high" ? "!" : "~"} ${h.label} @${h.path}: "${h.match}"`);
}
console.log(`\nTOTAL ${total}`);
