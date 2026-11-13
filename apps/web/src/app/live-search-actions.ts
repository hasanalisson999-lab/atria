"use server";

import { fetchWithFallback, type NormalizedAd } from "@signal/shared";
import { embedMissingAds } from "@signal/shared/ai";
import { fromPostgresJs, upsertAds } from "@signal/shared/db";
import { dedupeCreatives } from "@signal/shared/media";
import { after } from "next/server";
import { getSql, isUnavailable } from "@/lib/server/db";

/** Followers a page needs to count as an established brand in live search results. */
const MIN_LIKES = 100_000;

/**
 * Searches the public Meta Ad Library live for a keyword (free fallback chain, results cached by the
 * providers' free allowances), keeps ads from established brands, stores them and returns how many.
 */
export async function liveSearchAds(q: string): Promise<{ ok: true; added: number; brands: string[]; provider: string | null } | { ok: false; error: string }> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { ok: false, error: "Type at least 2 characters" };
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  const db = fromPostgresJs(sql);
  // Same keyword within 24h: don't spend free credits again.
  const key = `live:${term.toLowerCase()}`;
  const [recent] = await sql<{ result: { added: number; brands: string[] } }[]>`select result from public.search_cache where key = ${key} and created_at > now() - interval '24 hours'`;
  if (recent) return { ok: true, added: recent.result.added, brands: recent.result.brands, provider: "cache" };

  const chain = await fetchWithFallback(db, { q: term, limit: 90 }, { jobId: `live-search:${term}` });
  if (!chain.provider) return { ok: false, error: `No source could search right now (${chain.tried.map((t) => `${t.provider}: ${t.outcome}`).slice(0, 3).join(" · ")})` };
  const branded = chain.ads.filter((a: NormalizedAd) => (a.brand?.likes ?? 0) >= MIN_LIKES);
  const r = branded.length ? await upsertAds(db, branded) : { inserted: 0 };
  const brands = [...new Set(branded.map((a) => a.brand?.name).filter((n): n is string => !!n))].slice(0, 12);
  await sql`insert into public.search_cache (key, provider, result) values (${key}, ${chain.provider}, ${JSON.stringify({ added: r.inserted, brands })}::text::jsonb)
            on conflict (key) do update set result = excluded.result, provider = excluded.provider, created_at = now()`;
  // Group duplicates and embed the new creatives after responding.
  after(async () => {
    await dedupeCreatives(db, { concurrency: 6 }).catch(() => undefined);
    if (process.env.VOYAGE_API_KEY) await embedMissingAds(process.env.VOYAGE_API_KEY, db, { limit: 300 }).catch(() => undefined);
  });
  return { ok: true, added: r.inserted, brands, provider: chain.provider };
}
