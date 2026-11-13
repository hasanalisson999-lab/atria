import { loadRootEnv } from "@signal/shared/env-file";
import { createSql, fromPostgresJs } from "@signal/shared/db";
import { fetchTikTokAds } from "@signal/shared";
loadRootEnv();
const sql = createSql(process.env.DATABASE_URL!, { max: 1 });
for (const brand of (process.argv[2] ?? "Crocs").split(",")) {
  const r = await fetchTikTokAds(fromPostgresJs(sql), brand, { limit: 12 });
  console.log(brand, "→", r.provider, r.ads.length, "ads |", r.tried.join(" · "));
  for (const a of r.ads.slice(0, 2)) console.log("   ", a.startDate, a.format, (a.bodyText ?? "").slice(0, 70), a.media[0]?.previewUrl ? "thumb✓" : "");
}
await sql.end();
