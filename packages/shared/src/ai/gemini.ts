import { z } from "zod";
import { HttpError, fetchJson, withRetry } from "../retry.ts";
import type { Queryable } from "../db/client.ts";
import { extractJson, generate, type LlmKeys, NoFreeModelError } from "./llm.ts";

/**
 * Ad creative breakdown. Gemini's FREE tier goes first (it watches the actual video and writes the best copy);
 * when Gemini is out of quota or down, the free-model router (Groq / OpenRouter vision models) breaks the ad
 * down from the thumbnail + copy instead. Every call is logged at $0 so free daily limits are respected.
 */

/** Free-tier models in preference order, with this account's limits (AI Studio → Rate limit). */
export const GEMINI_FREE_MODELS = [
  { id: "gemini-3.5-flash-lite", rpd: 500, rpm: 15 },
  { id: "gemini-3.1-flash-lite", rpd: 500, rpm: 15 },
] as const;
const SAFETY_MARGIN = 0.92;
const API = "https://generativelanguage.googleapis.com";

/** Bump when the breakdown format changes (older rows are re-analyzed on open). */
export const ANALYSIS_VERSION = 2;

export const sceneSchema = z.object({
  start_s: z.coerce.number().default(0),
  end_s: z.coerce.number().default(0),
  visual: z.string(),
  voiceover: z.string().nullish().transform((v) => v ?? ""),
  on_screen_text: z.string().nullish().transform((v) => v ?? ""),
});

const list = (max: number) =>
  z
    .array(z.string())
    .nullish()
    .transform((a) => (a ?? []).map((x) => x.trim()).filter(Boolean).slice(0, max));
const str = z
  .string()
  .nullish()
  .transform((v) => (v ?? "").trim());

export const adBreakdownSchema = z.object({
  transcript: str,
  hook_text: z.string(),
  hook_type: str.transform((v) => v || "other"),
  angle: z.string(),
  awareness_level: str,
  format_tags: list(4),
  emotions: list(3),
  offer: str,
  target_audience: str,
  script_breakdown: z
    .array(sceneSchema)
    .nullish()
    .transform((a) => (a ?? []).slice(0, 5)),
  /** 3 short bullets. */
  why_it_works: z.union([z.array(z.string()), z.string()]).transform((v) =>
    (Array.isArray(v) ? v : v.split(/\n+|(?<=\.)\s+(?=[A-Z])/))
      .map((x) => x.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3),
  ),
  /** One concrete move our brand can steal. */
  takeaway: str,
});
export type AdBreakdown = z.infer<typeof adBreakdownSchema>;

const S = (description: string) => ({ type: "STRING", description });
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: S("Verbatim spoken words, no timestamps. Empty string if nobody speaks."),
    hook_text: S("The exact scroll-stopping line from the first 1-3 seconds (spoken or on-screen). Max 15 words."),
    hook_type: S("One of: question, bold claim, problem, social proof, demo, curiosity, offer, UGC reaction, before/after, other."),
    angle: S("The core angle in ONE plain sentence, max 14 words."),
    awareness_level: S("One of: unaware, problem aware, solution aware, product aware, most aware."),
    format_tags: { type: "ARRAY", items: { type: "STRING" }, description: "Max 4 short tags, e.g. UGC, talking head, product demo, athlete, static, carousel." },
    emotions: { type: "ARRAY", items: { type: "STRING" }, description: "Max 3 single words." },
    offer: S("The offer in max 8 words (discount, free shipping, guarantee). Empty if none."),
    target_audience: S("Who it's for, max 10 words."),
    script_breakdown: {
      type: "ARRAY",
      description: "The 3-5 key beats only (not every cut). For images: one beat with start_s=0,end_s=0.",
      items: {
        type: "OBJECT",
        properties: {
          start_s: { type: "NUMBER" },
          end_s: { type: "NUMBER" },
          visual: S("What happens, max 12 words."),
          voiceover: S("Key line said, max 15 words. Empty if none."),
          on_screen_text: S("Key on-screen text, max 10 words. Empty if none."),
        },
        required: ["start_s", "end_s", "visual"],
      },
    },
    why_it_works: { type: "ARRAY", items: { type: "STRING" }, description: "Exactly 3 bullets, max 14 words each. Persuasion mechanics, not description." },
    takeaway: S("One imperative sentence (max 22 words): the specific move our brand should steal from this ad."),
  },
  required: ["hook_text", "hook_type", "angle", "awareness_level", "target_audience", "why_it_works", "script_breakdown", "takeaway"],
};

export interface CreativeInput {
  brand: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  landingDomain: string | null;
  format: string;
  /** Downloaded media to analyze (video preferred). */
  media: { mimeType: string; bytes: Uint8Array }[];
  /** A still image (thumbnail) for fallback models that can't watch video. */
  still?: { mimeType: string; bytes: Uint8Array } | null;
  /** Our brand, so the takeaway is actionable. */
  forBrand?: string;
}

/** Shared instructions for every model that writes a breakdown. */
export function breakdownPrompt(input: CreativeInput, opts: { jsonShape: boolean; hasMedia: boolean }): string {
  const us = input.forBrand ?? "our brand";
  return [
    "You are a world-class direct-response creative strategist. Break this Meta ad down for a busy marketer.",
    "Rules: short, concrete, punchy. No filler, no hedging, no jargon. Quote real words from the ad. Respect every word limit.",
    `We are ${us}. The takeaway must be a move ${us} can actually run next week.`,
    "",
    `Brand: ${input.brand ?? "unknown"} · Format: ${input.format} · Landing: ${input.landingDomain ?? "unknown"}`,
    `Headline: ${input.headline ?? "-"}`,
    `Primary text: ${input.body ?? "-"}`,
    `CTA button: ${input.cta ?? "-"}`,
    opts.hasMedia ? "Study the attached creative. Use real timestamps in seconds for video." : "No media is attached: infer from the copy only.",
    opts.jsonShape
      ? "Return ONLY one JSON object with keys: transcript (string), hook_text (max 15 words), hook_type, angle (max 14 words), awareness_level, format_tags (string[] max 4), emotions (string[] max 3), offer, target_audience (max 10 words), script_breakdown (array of 3-5 {start_s, end_s, visual, voiceover, on_screen_text}), why_it_works (string[] of exactly 3, max 14 words each), takeaway (one imperative sentence, max 22 words)."
      : "Return JSON only.",
  ].join("\n");
}

export class FreeTierExhaustedError extends Error {
  constructor() {
    super("Gemini free daily limit reached on all free models. It resets daily; nothing was charged.");
    this.name = "FreeTierExhaustedError";
  }
}

/** Requests in the last 24h per model, from the cost ledger (conservative vs. Google's Pacific-midnight reset). */
async function usedLast24h(db: Queryable): Promise<Map<string, number>> {
  const rows = await db.query<{ operation: string; n: number }>(
    "select operation, count(*)::int as n from public.cost_ledger where provider = 'gemini' and created_at > now() - interval '24 hours' group by operation",
  );
  const m = new Map<string, number>();
  for (const r of rows) {
    const model = r.operation.split(":")[1] ?? r.operation;
    m.set(model, (m.get(model) ?? 0) + Number(r.n));
  }
  return m;
}

async function uploadFile(apiKey: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `signal-ad-${Date.now()}` } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new HttpError(start.status, `Gemini upload start failed: ${await start.text()}`);
  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Length": String(bytes.byteLength) },
    body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
  });
  if (!done.ok) throw new HttpError(done.status, `Gemini upload failed: ${await done.text()}`);
  const { file } = (await done.json()) as { file: { name: string; uri: string; state: string } };
  for (let i = 0; i < 30 && file.state !== "ACTIVE"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const f = await fetchJson<{ state: string }>(`${API}/v1beta/${file.name}`, { headers: { "x-goog-api-key": apiKey } });
    file.state = f.state;
    if (f.state === "FAILED") throw new Error("Gemini could not process the video file");
  }
  return file.uri;
}

const INLINE_LIMIT = 14 * 1024 * 1024;

/** Gemini-only breakdown (watches video). Throws FreeTierExhaustedError when every free model is used up. */
export async function analyzeCreative(apiKey: string, db: Queryable, input: CreativeInput): Promise<{ breakdown: AdBreakdown; model: string; tokens: number }> {
  const used = await usedLast24h(db);
  const models = GEMINI_FREE_MODELS.filter((m) => (used.get(m.id) ?? 0) < m.rpd * SAFETY_MARGIN);
  if (!models.length) throw new FreeTierExhaustedError();

  const parts: Record<string, unknown>[] = [];
  for (const m of input.media) {
    if (m.bytes.byteLength > INLINE_LIMIT) parts.push({ file_data: { mime_type: m.mimeType, file_uri: await uploadFile(apiKey, m.bytes, m.mimeType) } });
    else parts.push({ inline_data: { mime_type: m.mimeType, data: Buffer.from(m.bytes).toString("base64") } });
  }
  parts.push({ text: breakdownPrompt(input, { jsonShape: false, hasMedia: input.media.length > 0 }) });

  let lastErr: unknown;
  for (const model of models) {
    try {
      const res = await withRetry(
        () =>
          fetchJson<{
            candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
            usageMetadata?: { totalTokenCount?: number };
          }>(`${API}/v1beta/models/${model.id}:generateContent`, {
            method: "POST",
            timeoutMs: 180_000,
            headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              // Low media resolution: a short ad reads fine and the breakdown comes back several times faster.
              generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.5, mediaResolution: "MEDIA_RESOLUTION_LOW" },
            }),
          }),
        { retries: 1, baseMs: 3000, isRetryable: (e) => e instanceof HttpError && e.status >= 500 },
      );
      // Free-tier usage is logged at $0 so daily limits can be enforced.
      const tokens = res.usageMetadata?.totalTokenCount ?? 0;
      await db.query("insert into public.cost_ledger (provider, operation, units, usd, meta) values ('gemini', $1, 1, 0, $2::text::jsonb)", [
        `analyze:${model.id}`,
        JSON.stringify({ tokens, free_tier: true }),
      ]);
      const text = res.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      const breakdown = adBreakdownSchema.parse(extractJson(text));
      return { breakdown, model: model.id, tokens };
    } catch (err) {
      lastErr = err;
      // 429 = this model's free quota is used up; 5xx = overloaded. Try the next free model.
      if (err instanceof HttpError && (err.status === 429 || err.status >= 500)) continue;
      throw err;
    }
  }
  if (lastErr instanceof HttpError && lastErr.status === 429) throw new FreeTierExhaustedError();
  throw lastErr;
}

/**
 * Best free breakdown available: Gemini (video-aware) first, then Groq/OpenRouter models using the still
 * image + copy. Never costs money.
 */
export async function analyzeCreativeAny(keys: LlmKeys, db: Queryable, input: CreativeInput): Promise<{ breakdown: AdBreakdown; model: string; provider: string }> {
  let geminiErr: unknown = null;
  if (keys.gemini) {
    try {
      const r = await analyzeCreative(keys.gemini, db, input);
      return { breakdown: r.breakdown, model: r.model, provider: "gemini" };
    } catch (e) {
      // Any Gemini failure (quota, timeout, network, bad JSON, oversized video) falls through to the other free models.
      geminiErr = e;
      if (input.media.some((m) => m.mimeType.startsWith("video/")) && input.still) {
        // Video too heavy or rejected: Gemini can still read the poster frame + copy.
        try {
          const r = await analyzeCreative(keys.gemini, db, { ...input, media: [input.still] });
          return { breakdown: r.breakdown, model: r.model, provider: "gemini" };
        } catch (e2) {
          geminiErr = e2;
        }
      }
    }
  }
  const still = input.still ?? input.media.find((m) => m.mimeType.startsWith("image/")) ?? null;
  const images = still && still.bytes.byteLength < 4 * 1024 * 1024 ? [{ mimeType: still.mimeType, data: Buffer.from(still.bytes).toString("base64") }] : [];
  try {
    // Two tries with the image (vision models), then one copy-only try (any text model).
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const withImages = attempt < 2 ? images : [];
      if (attempt === 1 && !images.length) continue;
      let r: Awaited<ReturnType<typeof generate>>;
      try {
        r = await generate(keys, db, {
        operation: "analyze",
        skipGemini: true,
        prompt: breakdownPrompt(input, { jsonShape: true, hasMedia: withImages.length > 0 }),
        images: withImages,
        json: true,
        temperature: 0.5,
        maxTokens: 1500,
        });
      } catch (e) {
        // A vision request can fail where a text-only one works: keep going.
        lastErr = e;
        continue;
      }
      try {
        return { breakdown: adBreakdownSchema.parse(extractJson(r.text)), model: r.model, provider: r.provider };
      } catch {
        // Malformed JSON: one more try (the router may pick the same or the next model).
      }
    }
    throw lastErr ?? new Error("Free fallback models returned malformed breakdowns");
  } catch (e) {
    if (e instanceof NoFreeModelError && geminiErr instanceof FreeTierExhaustedError) throw geminiErr;
    throw e;
  }
}

export async function saveAnalysis(db: Queryable, adId: string, b: AdBreakdown, model: string): Promise<void> {
  await db.query(
    `insert into public.ad_analysis (ad_id, transcript, hook_text, hook_type, angle, awareness_level, format_tags, emotions, offer,
       target_audience, script_breakdown, why_it_works, takeaway, version, model, cost_usd, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text::jsonb, $12, $13, $14, $15, 0, now())
     on conflict (ad_id) do update set transcript = excluded.transcript, hook_text = excluded.hook_text, hook_type = excluded.hook_type,
       angle = excluded.angle, awareness_level = excluded.awareness_level, format_tags = excluded.format_tags, emotions = excluded.emotions,
       offer = excluded.offer, target_audience = excluded.target_audience, script_breakdown = excluded.script_breakdown,
       why_it_works = excluded.why_it_works, takeaway = excluded.takeaway, version = excluded.version, model = excluded.model, cost_usd = 0, created_at = now()`,
    [
      adId,
      b.transcript,
      b.hook_text,
      b.hook_type,
      b.angle,
      b.awareness_level,
      b.format_tags,
      b.emotions,
      b.offer,
      b.target_audience,
      JSON.stringify(b.script_breakdown),
      b.why_it_works.join("\n"),
      b.takeaway,
      ANALYSIS_VERSION,
      model,
    ],
  );
}

/** Free-tier text generation via the router (Gemini first, then Groq/OpenRouter). Kept for older callers. */
export async function geminiText(apiKey: string, db: Queryable, prompt: string, opts: { operation?: string; temperature?: number } = {}): Promise<{ text: string; model: string }> {
  const r = await generate({ ...keysFromProcess(), gemini: apiKey }, db, { prompt, operation: opts.operation ?? "text", temperature: opts.temperature });
  return { text: r.text, model: r.model };
}

function keysFromProcess(): LlmKeys {
  return { groq: process.env.GROQ_API_KEY || undefined, openrouter: process.env.OPENROUTER_API_KEY || undefined };
}
