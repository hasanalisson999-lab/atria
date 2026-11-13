import { fetchWithFallback } from "@signal/shared";
import { embedMissingAds } from "@signal/shared/ai";
import { fromPostgresJs, upsertAds } from "@signal/shared/db";
import { dedupeCreatives } from "@signal/shared/media";
import { brandDomain } from "@/lib/server/brand-sync";
import { getSql, isUnavailable } from "@/lib/server/db";

export const maxDuration = 300;

/**
 * Daily content refresh (Vercel Cron, or any scheduler sending `Authorization: Bearer $CRON_SECRET`).
 * Refreshes the brands that went longest without an update (tracked brands first), collapses
 * duplicates and embeds new creatives. Sized to stay inside the free allowances: ~4 brands a day.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getSql();
  if (isUnavailable(sql)) return Response.json({ error: sql.reason }, { status: 500 });
  const db = fromPostgresJs(sql);
  const started = Date.now();
  const perRun = Math.min(Number(new URL(req.url).searchParams.get("brands") ?? 4) || 4, 10);

  const [run] = await sql<{ id: string }[]>`insert into public.job_runs (job_name, status, started_at) values ('cron-refresh', 'running', now()) returning id`;
  const brands = await sql<{ id: string; name: string; platform_page_id: string }[]>`
    select id, name, platform_page_id from public.brands
    where quality = 'brand' and status <> 'ignored' and merged_into is null and platform = 'meta'
    order by (status = 'tracked') desc, ads_synced_at asc nulls first
    limit ${perRun}`;
  const done: { brand: string; ads: number; added: number; provider: string | null }[] = [];
  try {
    for (const b of brands) {
      if (Date.now() - started > 200_000) break; // leave time for dedupe + embeddings
      const chain = await fetchWithFallback(db, { pageId: b.platform_page_id, limit: 30, domain: await brandDomain(sql, b.id) }, { jobId: run?.id ?? "cron" });
      let added = 0;
      if (chain.ads.length) {
        added = (await upsertAds(db, chain.ads)).inserted;
        await sql`update public.ads set brand_id = ${b.id} where brand_id in (select id from public.brands where merged_into = ${b.id} or platform_page_id = ${b.platform_page_id})`;
        await dedupeCreatives(db, { concurrency: 6, brandId: b.id }).catch(() => undefined);
      }
      await sql`update public.brands set ads_synced_at = now() where id = ${b.id}`;
      done.push({ brand: b.name, ads: chain.ads.length, added, provider: chain.provider });
    }
    if (process.env.VOYAGE_API_KEY && Date.now() - started < 260_000) await embedMissingAds(process.env.VOYAGE_API_KEY, db, { limit: 200 }).catch(() => undefined);
    await sql`update public.job_runs set status = 'succeeded', finished_at = now(), stats = ${JSON.stringify({ brands: done, ms: Date.now() - started })}::text::jsonb where id = ${run!.id}`;
    return Response.json({ ok: true, brands: done });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : String(e);
    await sql`update public.job_runs set status = 'failed', finished_at = now(), error = ${msg} where id = ${run!.id}`.catch(() => undefined);
    return Response.json({ ok: false, error: msg, brands: done }, { status: 500 });
  }
}
