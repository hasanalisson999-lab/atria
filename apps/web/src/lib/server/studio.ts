import "server-only";
import { EMBED_MODEL, toVector, voyageEmbed } from "@signal/shared/ai";
import { fromPostgresJs, type Sql } from "@signal/shared/db";

/** One library ad given to the model as evidence (and shown to the user as a source). */
export interface StudioSource {
  ref: string;
  id: string;
  brand: string | null;
  brand_logo: string | null;
  thumbnail_url: string | null;
  headline: string | null;
  days: number | null;
  format: string;
  hook: string | null;
}

export type StudioMode = "chat" | "hooks" | "script" | "brief" | "copy" | "gaps" | "remix";

export interface StudioScope {
  niche: string | null;
  brandIds: string[];
}

export interface BrandProfileSettings {
  name: string;
  products: string;
  audience: string;
  voice: string;
  offers: string;
}

interface Row {
  id: string;
  brand_id: string | null;
  brand: string | null;
  brand_logo: string | null;
  headline: string | null;
  body_text: string | null;
  cta: string | null;
  format: string;
  days_running: number | null;
  thumbnail_url: string | null;
  hook_text: string | null;
  angle: string | null;
  why: string | null;
  takeaway: string | null;
  dist?: number;
}

const COLS = `a.id, a.brand_id, b.name as brand,
  case when b.platform = 'meta' then 'https://graph.facebook.com/' || b.platform_page_id || '/picture?type=large&width=200&height=200' else b.logo_url end as brand_logo,
  a.headline, left(a.body_text, 420) as body_text, a.cta, a.format::text as format, a.days_running, a.thumbnail_url,
  x.hook_text, x.angle, left(x.why_it_works, 300) as why, x.takeaway`;

async function embedQuery(sql: Sql, text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;
  const cacheKey = `emb:${EMBED_MODEL}:${text.trim().toLowerCase().slice(0, 300)}`;
  const [hit] = await sql<{ result: number[] }[]>`select result from public.search_cache where key = ${cacheKey}`;
  if (hit) return hit.result;
  try {
    const [vec] = await voyageEmbed(key, [text.slice(0, 1500)], "query", fromPostgresJs(sql));
    if (!vec) return null;
    await sql`insert into public.search_cache (key, provider, result) values (${cacheKey}, 'voyage', ${JSON.stringify(vec)}::text::jsonb) on conflict (key) do nothing`;
    return vec;
  } catch {
    return null;
  }
}

/**
 * The most relevant real ads for a question: semantic nearest neighbours (Voyage embeddings) inside the
 * chosen scope, re-ranked towards long-running winners and brands named in the question, max 4 per brand.
 */
export async function retrieveAds(sql: Sql, question: string, scope: StudioScope, opts: { adId?: string | null; limit?: number } = {}): Promise<Row[]> {
  const limit = opts.limit ?? 20;
  const brandIds = scope.brandIds.filter((b) => /^[0-9a-f-]{36}$/i.test(b)).slice(0, 12);
  const named = await sql<{ id: string }[]>`
    select id from public.brands where merged_into is null and quality = 'brand' and length(name) > 2 and ${question.toLowerCase()} like '%' || lower(name) || '%' limit 6`;
  const namedIds = new Set(named.map((n) => n.id));
  const pinned = opts.adId && /^[0-9a-f-]{36}$/i.test(opts.adId)
    ? await sql<Row[]>`select ${sql.unsafe(COLS)} from public.ads a join public.brands b on b.id = a.brand_id left join public.ad_analysis x on x.ad_id = a.id where a.id = ${opts.adId}`
    : [];

  const vec = await embedQuery(sql, question);
  let rows: Row[];
  if (vec) {
    rows = await sql<Row[]>`
      select ${sql.unsafe(COLS)}, (e.embedding operator(extensions.<=>) ${toVector(vec)}::extensions.vector) as dist
      from public.ad_embeddings e
      join public.ads a on a.id = e.ad_id
      join public.brands b on b.id = a.brand_id
      left join public.ad_analysis x on x.ad_id = a.id
      where b.quality = 'brand' and b.status <> 'ignored'
        and (${scope.niche}::text is null or b.category = ${scope.niche})
        and (${brandIds.length === 0} or a.brand_id = any(${brandIds}::uuid[]))
      order by e.embedding operator(extensions.<=>) ${toVector(vec)}::extensions.vector
      limit 80`;
  } else {
    const words = (question.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? []).slice(0, 8);
    const tsq = words.join(" | ");
    rows = await sql<Row[]>`
      select distinct on (coalesce(a.creative_group, a.id::text)) ${sql.unsafe(COLS)}, 0.6 as dist
      from public.ads a join public.brands b on b.id = a.brand_id left join public.ad_analysis x on x.ad_id = a.id
      where b.quality = 'brand' and b.status <> 'ignored'
        and (${scope.niche}::text is null or b.category = ${scope.niche})
        and (${brandIds.length === 0} or a.brand_id = any(${brandIds}::uuid[]))
        and (${tsq.length === 0} or a.search_tsv @@ to_tsquery('simple', ${tsq || "x"}))
      order by coalesce(a.creative_group, a.id::text), a.days_running desc nulls last
      limit 200`;
  }
  // Named brands that the vector search missed still get their best winners in.
  if (namedIds.size) {
    const extra = await sql<Row[]>`
      select ${sql.unsafe(COLS)}, 0.7 as dist from public.ads a join public.brands b on b.id = a.brand_id left join public.ad_analysis x on x.ad_id = a.id
      where a.brand_id = any(${[...namedIds]}::uuid[]) and a.is_active order by a.days_running desc nulls last limit 12`;
    rows.push(...extra);
  }
  const score = (r: Row) => (1 - Number(r.dist ?? 0.6)) * 3 + Math.min(r.days_running ?? 0, 365) / 180 + (r.hook_text ? 0.3 : 0) + (r.brand_id && namedIds.has(r.brand_id) ? 1.5 : 0);
  const seen = new Set<string>(pinned.map((p) => p.id));
  const perBrand = new Map<string, number>();
  const out: Row[] = [...pinned];
  for (const r of [...rows].sort((a, b) => score(b) - score(a))) {
    if (out.length >= limit) break;
    if (seen.has(r.id)) continue;
    // Cosine distance above ~0.75 means the ad isn't really about the question (named brands are kept).
    if (vec && Number(r.dist ?? 0) > 0.75 && !(r.brand_id && namedIds.has(r.brand_id))) continue;
    const k = r.brand_id ?? r.id;
    const cap = brandIds.length || namedIds.has(k) ? 8 : 4;
    if ((perBrand.get(k) ?? 0) >= cap) continue;
    perBrand.set(k, (perBrand.get(k) ?? 0) + 1);
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function toSources(rows: Row[]): StudioSource[] {
  return rows.map((r, i) => ({
    ref: `A${i + 1}`,
    id: r.id,
    brand: r.brand,
    brand_logo: r.brand_logo,
    thumbnail_url: r.thumbnail_url,
    headline: r.headline,
    days: r.days_running,
    format: r.format,
    hook: r.hook_text,
  }));
}

export function contextBlock(rows: Row[]): string {
  return rows
    .map((r, i) =>
      [
        `[A${i + 1}] ${r.brand} · ${r.format === "dco" ? "dynamic" : r.format} · running ${r.days_running ?? "?"} days`,
        r.hook_text ? `  Hook: "${r.hook_text}"` : null,
        r.headline ? `  Headline: ${r.headline}` : null,
        r.body_text ? `  Copy: ${r.body_text.replace(/\s+/g, " ")}` : null,
        r.cta ? `  CTA: ${r.cta}` : null,
        r.angle ? `  Angle: ${r.angle}` : null,
        r.why ? `  Why it works: ${r.why.replace(/\n/g, "; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

const MODE_RULES: Record<StudioMode, string> = {
  chat: "Answer the user's request directly. Be specific and immediately usable.",
  hooks:
    "Write the requested number of scroll-stopping hooks as a numbered list. Each: the hook line in bold (max 12 words), then ' — ' and the mechanism in a few words with the source ref. Mix hook types (question, bold claim, pain, proof, curiosity, demo). End with a one-line tip on which 2 to test first.",
  script:
    "Write a ready-to-shoot video ad script. Start with a one-line concept. Then a numbered scene list with timestamps (0-3s hook, …), each scene: **Visual:**, **VO/On-screen:** lines. Then 3 alternative opening hooks, the CTA, and a short shot list for the creator. Respect the requested length.",
  brief:
    "Write a creative brief: **Objective**, **Audience insight**, **Key message**, then 3 numbered concepts (name, hook, format, why it should win, citing refs), **Must-haves**, **Success metric**. Tight, no fluff.",
  copy: "Write Meta ad copy variations: 5 primary texts (different angles, ≤ 60 words each, first line is the hook), 5 headlines (≤ 40 characters), 3 descriptions. Number them. Cite the winners each draws from.",
  gaps:
    "Compare the brands in the evidence: a short table-like list per brand (angles, hooks, offers, formats they lean on), then **Gaps we can own**: 3-5 numbered opportunities for our brand that none of them is using, each with a concrete ad idea.",
  remix:
    "Remix the first ad [A1] for our brand: explain in 2 bullets why the original works, then write the remixed version (hook, script or copy matching the original's format), then 2 variations. Keep the mechanism, change everything brand-specific.",
};

/** Builds the question used for retrieval and the full prompt for one Studio turn. */
export function buildStudioPrompt(input: {
  mode: StudioMode;
  fields: Record<string, string>;
  history: { role: "user" | "assistant"; text: string }[];
  profile: BrandProfileSettings;
  context: string;
  count: number;
  /** Full onboarding profile (price point, markets, competitors, goals…) when the brand is set up. */
  brief?: string | null;
}): { system: string; prompt: string } {
  const { profile: p } = input;
  const system = `You are Atria's senior creative strategist writing for ${p.name}.

GROUNDING RULES (strict):
1. Facts about other brands' ads come ONLY from the LIBRARY below. Cite each one inline with its exact ref, e.g. [A3]. Never cite a ref that is not listed.
2. The library only knows: brand, format, copy, hook, CTA and how many days an ad ran. You do NOT know spend, CTR, ROAS, sales, reach or results. Never state or imply them.
3. If the library has nothing relevant to a question, say so in one sentence ("Your library has no ads about X yet") and then give clearly labelled general advice.
4. Never invent brands, products, prices, quotes or statistics. Quote ad copy exactly or not at all.
5. New ideas you write for ${p.name} (hooks, scripts, copy) are welcome: they need no citation, but say which ad inspired them when one did.

Long-running ads (many days) are proven; weigh them more. Write clean Markdown: short headings, numbered lists, bold for key lines. Be concrete and usable today. No filler, no disclaimers beyond rule 3.

BRAND WE WRITE FOR
Name: ${p.name}
Products: ${p.products}
Audience: ${p.audience}
Voice: ${p.voice}
Offers: ${p.offers}${input.brief ? `

FULL PROFILE (use it: price point, markets, competitors and goals shape every idea)
${input.brief}` : ""}`;
  const convo = input.history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text.slice(0, 2500)}`)
    .join("\n\n");
  const f = Object.entries(input.fields)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join("\n");
  const prompt = `TASK TYPE: ${input.mode}
${MODE_RULES[input.mode]}
${f ? `\nDETAILS\n${f}\n` : ""}
LIBRARY (${input.count} real ads)
${input.context || "(no matching ads found: say so briefly and give best-practice guidance)"}

CONVERSATION
${convo}

Write the answer to the user's last message now.`;
  return { system, prompt };
}
