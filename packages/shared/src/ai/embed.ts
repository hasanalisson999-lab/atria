import { HttpError, fetchJson } from "../retry.ts";
import type { Queryable } from "../db/client.ts";

/**
 * Semantic embeddings with Voyage's free token allowance (voyage-4-lite, 1024 dims to match ad_embeddings).
 * Used for "similar hooks / similar ads". Every call is logged to the ledger at $0 with its token count.
 */
export const EMBED_MODEL = "voyage-4-lite";
export const EMBED_DIMS = 1024;

export async function voyageEmbed(apiKey: string, texts: string[], inputType: "document" | "query", db?: Queryable): Promise<number[][]> {
  if (!texts.length) return [];
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchJson<{ data: { embedding: number[]; index: number }[]; usage?: { total_tokens?: number } }>("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        timeoutMs: 60_000,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input: texts.map((t) => t.slice(0, 2000).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "") || " "), input_type: inputType, output_dimension: EMBED_DIMS }),
      });
      if (db)
        await db.query("insert into public.cost_ledger (provider, operation, units, usd, meta) values ('voyage', $1, $2, 0, $3::text::jsonb)", [
          `embed:${EMBED_MODEL}`,
          res.usage?.total_tokens ?? 0,
          JSON.stringify({ texts: texts.length, free_tier: true }),
        ]);
      return [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    } catch (e) {
      // Free accounts are rate limited per minute: wait it out a few times.
      if (e instanceof HttpError && e.status === 429 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 21_000));
        continue;
      }
      throw e;
    }
  }
}

export const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;

/** The text that represents an ad for similarity: its hook/opening line first, then headline and copy. */
export function adEmbeddingText(a: { hook_text?: string | null; headline?: string | null; body_text?: string | null; brand?: string | null }): string {
  const opening = (a.body_text ?? "").split("\n").find((l) => l.trim().length > 3)?.trim() ?? "";
  return [a.hook_text, opening, a.headline, (a.body_text ?? "").slice(0, 400)].filter(Boolean).join("\n");
}

/**
 * Embed creatives that have no embedding yet (one representative per creative group, longest-running first).
 * Returns how many were embedded. Safe to call repeatedly.
 */
export async function embedMissingAds(apiKey: string, db: Queryable, opts: { limit?: number; batch?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<number> {
  const rows = await db.query<{ id: string; hook_text: string | null; headline: string | null; body_text: string | null }>(
    `select distinct on (coalesce(a.creative_group, a.id::text)) a.id, x.hook_text, a.headline, a.body_text
     from public.ads a
     left join public.ad_analysis x on x.ad_id = a.id
     where coalesce(a.body_text, a.headline, '') <> ''
       and not exists (
         select 1 from public.ad_embeddings e join public.ads s on s.id = e.ad_id
         where s.id = a.id or (a.creative_group is not null and s.creative_group = a.creative_group)
       )
     order by coalesce(a.creative_group, a.id::text), a.is_active desc, a.days_running desc nulls last
     limit $1`,
    [opts.limit ?? 5000],
  );
  const batch = opts.batch ?? 96;
  let done = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const vecs = await voyageEmbed(apiKey, chunk.map(adEmbeddingText), "document", db);
    await db.query(
      `insert into public.ad_embeddings (ad_id, embedding, model)
       select r.id::uuid, r.v::extensions.vector, $2 from jsonb_to_recordset($1::text::jsonb) as r(id text, v text)
       on conflict (ad_id) do update set embedding = excluded.embedding, model = excluded.model, created_at = now()`,
      [JSON.stringify(chunk.map((r, k) => ({ id: r.id, v: toVector(vecs[k]!) }))), EMBED_MODEL],
    );
    done += chunk.length;
    opts.onProgress?.(done, rows.length);
  }
  return done;
}
