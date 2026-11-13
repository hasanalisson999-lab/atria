import { loadRootEnv } from "@signal/shared/env-file";
import { createSql } from "@signal/shared/db";
import { seedCategoryBrands } from "../../apps/web/src/lib/server/category-seed.ts";

/** Pull a category's catalog brands now (same code the Discover page runs on demand). Usage: tsx --conditions=react-server src/seed-category.ts footwear 30 */
loadRootEnv();
const [cat = "footwear", max = "30"] = process.argv.slice(2);
const sql = createSql(process.env.DATABASE_URL!, { max: 4 });
await seedCategoryBrands(sql, cat, Number(max), (p) => {
  if (p.done != null) console.log(`${p.done} done · added ${p.added?.length ?? 0} · skipped ${(p.skipped ?? []).join(", ") || "-"} · ${p.ads ?? 0} new ads`);
});
await sql.end();
