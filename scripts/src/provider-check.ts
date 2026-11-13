import { loadRootEnv } from "@signal/shared/env-file";
import { createSql, fromPostgresJs } from "@signal/shared/db";
import { FALLBACK_PROVIDERS, fetchWithFallback } from "../../packages/shared/src/sources/providers.ts";

/**
 * One small live call per named provider, logged to the ledger like any real call, to verify the
 * shape normalizes. Usage: tsx src/provider-check.ts socialfetch,metapi [pageId] [limit]
 */
loadRootEnv();
const [ids = "", pageId = "702421736592975" /* HOKA */, limit = "10"] = process.argv.slice(2);
const sql = createSql(process.env.DATABASE_URL!, { max: 2 });
const db = fromPostgresJs(sql);
for (const id of ids.split(",").filter(Boolean)) {
  const p = FALLBACK_PROVIDERS.find((x) => x.id === id);
  if (!p) {
    console.log(id, "unknown provider");
    continue;
  }
  const r = await fetchWithFallback(db, { pageId, limit: Number(limit) }, { providers: [p], jobId: "provider-check" });
  console.log(`${id}: ${r.tried.map((t) => t.outcome).join(" → ")}`);
  const fmt: Record<string, number> = {};
  for (const a of r.ads) fmt[a.format] = (fmt[a.format] ?? 0) + 1;
  const a = r.ads[0];
  if (a)
    console.log(
      "  formats:",
      JSON.stringify(fmt),
      "· with media:",
      r.ads.filter((x) => x.media.length).length,
      "\n  sample:",
      JSON.stringify({ id: a.sourceAdId, page: a.brand?.name, start: a.startDate, active: a.isActive, media: a.media.length, cta: a.cta, domain: a.landingDomain, body: a.bodyText?.slice(0, 60) }),
    );
}
await sql.end();
