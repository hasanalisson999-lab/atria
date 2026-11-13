"use server";

import { NoFreeModelError, generate, keysFromEnv } from "@signal/shared/ai";
import { fromPostgresJs } from "@signal/shared/db";
import { getSql, isUnavailable } from "@/lib/server/db";

export interface BrandProfileSettings {
  name: string;
  products: string;
  audience: string;
  voice: string;
  offers: string;
}

const DEFAULT_PROFILE: BrandProfileSettings = {
  name: "Oneletic",
  products: "Performance athletic footwear and training apparel (running shoes, gym shoes, shorts, tees).",
  audience: "Gym-goers and runners aged 18–40 who want performance gear that also looks good.",
  voice: "Confident, direct, motivating. Short sentences. No fluff.",
  offers: "Free shipping, 30-day returns.",
};

export async function getBrandSettings(): Promise<BrandProfileSettings> {
  const sql = getSql();
  if (isUnavailable(sql)) return DEFAULT_PROFILE;
  const [row] = await sql<{ value: BrandProfileSettings }[]>`select value from public.app_settings where key = 'brand_profile'`;
  return { ...DEFAULT_PROFILE, ...(row?.value ?? {}) };
}

export async function saveBrandSettings(p: BrandProfileSettings): Promise<{ ok: boolean; error?: string }> {
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  const clean = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v ?? "").slice(0, 800)]));
  await sql`insert into public.app_settings (key, value) values ('brand_profile', ${JSON.stringify(clean)}::text::jsonb)
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return { ok: true };
}

export interface Citation {
  ref: string;
  id: string;
  brand: string | null;
  thumbnail_url: string | null;
  headline: string | null;
  days: number | null;
}

export interface StudioMessage {
  role: "user" | "assistant";
  text: string;
}

const STOP = new Set("give me write make create for the and with from that this what which based on top best ads ad my our your into about how why can you using use some ideas idea".split(" "));

/** Grounded answer: retrieves real ads from the library and asks the best free model (Gemini → Groq → OpenRouter) to cite them. */
export async function studioAsk(history: StudioMessage[], niche: string | null): Promise<{ ok: true; text: string; citations: Citation[]; model: string } | { ok: false; error: string }> {
  const keys = keysFromEnv();
  if (!keys.gemini && !keys.groq && !keys.openrouter) return { ok: false, error: "Add GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY to .env" };
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  const question = history.filter((m) => m.role === "user").at(-1)?.text.trim() ?? "";
  if (!question) return { ok: false, error: "Ask something first" };

  try {
    const words = (question.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? []).filter((w) => !STOP.has(w)).slice(0, 8);
    const nicheFilter = ["footwear", "apparel", "supplements"].includes(niche ?? "") ? niche : null;
    // Brands named in the question.
    const named = await sql<{ id: string }[]>`
      select id from public.brands where merged_into is null and quality = 'brand' and ${question.toLowerCase()} like '%' || lower(name) || '%' and length(name) > 2 limit 4`;
    const tsq = words.join(" | ");
    const rows = await sql<{ id: string; brand: string | null; headline: string | null; body_text: string | null; cta: string | null; format: string; days_running: number | null; thumbnail_url: string | null; hook_text: string | null; angle: string | null; why: string | null }[]>`
      with pool as (
        select distinct on (coalesce(a.creative_group, a.id::text)) a.id, b.name as brand, a.headline, left(a.body_text, 320) as body_text, a.cta, a.format::text as format,
               a.days_running, a.thumbnail_url, x.hook_text, x.angle, left(x.why_it_works, 300) as why,
               (case when ${named.length > 0} and a.brand_id = any(${named.map((n) => n.id)}::uuid[]) then 3 else 0 end)
               + (case when ${tsq.length > 0} and a.search_tsv @@ to_tsquery('simple', ${tsq || "x"}) then 2 else 0 end)
               + least(coalesce(a.days_running, 0), 365) / 120.0
               + (case when x.ad_id is not null then 0.5 else 0 end) as score
        from public.ads a join public.brands b on b.id = a.brand_id left join public.ad_analysis x on x.ad_id = a.id
        where b.quality = 'brand' and b.status <> 'ignored' and (${nicheFilter}::text is null or b.category = ${nicheFilter})
        order by coalesce(a.creative_group, a.id::text), a.is_active desc, a.days_running desc nulls last
      )
      select * from pool order by score desc limit 24`;
    const citations: Citation[] = rows.map((r, i) => ({ ref: `A${i + 1}`, id: r.id, brand: r.brand, thumbnail_url: r.thumbnail_url, headline: r.headline, days: r.days_running }));
    const context = rows
      .map((r, i) =>
        [
          `[A${i + 1}] ${r.brand} · ${r.format} · running ${r.days_running ?? "?"} days`,
          r.hook_text ? `  AI hook: "${r.hook_text}"` : null,
          r.headline ? `  Headline: ${r.headline}` : null,
          r.body_text ? `  Copy: ${r.body_text.replace(/\s+/g, " ")}` : null,
          r.cta ? `  CTA: ${r.cta}` : null,
          r.angle ? `  Angle: ${r.angle}` : null,
          r.why ? `  Why it works: ${r.why}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n");
    const profile = await getBrandSettings();
    const convo = history
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n\n");

    const prompt = `You are Atria's creative strategist for the brand below. Use ONLY the real ads in the library context as evidence.
Cite the ads you draw from inline as [A1], [A7] etc. (exact refs from the context). Never invent ads, numbers or brands.
Long-running ads (many days) are proven winners; weigh them more.
Write in clean Markdown: short headings, numbered lists, bold for key phrases. Be specific and immediately usable (actual hook lines, scripts, briefs).

BRAND (we are writing for)
Name: ${profile.name}
Products: ${profile.products}
Audience: ${profile.audience}
Voice: ${profile.voice}
Offers: ${profile.offers}

LIBRARY CONTEXT (${rows.length} ads)
${context}

CONVERSATION
${convo}

Answer the user's last message now.`;
    const { text, model } = await generate(keys, fromPostgresJs(sql), { prompt, operation: "studio", temperature: 0.75, maxTokens: 3000 });
    const used = new Set([...text.matchAll(/\[A(\d+)\]/g)].map((m) => `A${m[1]}`));
    return { ok: true, text, citations: citations.filter((c) => used.has(c.ref)), model };
  } catch (e) {
    if (e instanceof NoFreeModelError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
}
