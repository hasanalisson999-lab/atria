import { HttpError, fetchJson } from "../retry.ts";
import type { Queryable } from "../db/client.ts";

/**
 * Free-only LLM router.
 *
 * Order: Gemini free tier (best copywriting, watches video) → Groq free tier (fast, generous daily limits)
 * → OpenRouter `:free` models. Model lists are fetched live from each provider and re-ranked every few
 * hours, so newly released free models are picked up automatically without code changes. Every call is
 * logged to the cost ledger at $0 so free daily limits can be respected.
 */

export type Provider = "gemini" | "groq" | "openrouter";

export interface FreeModel {
  provider: Provider;
  id: string;
  /** Accepts images. */
  vision: boolean;
  /** Accepts video. */
  video: boolean;
  context: number;
  score: number;
}

export interface LlmImage {
  mimeType: string;
  /** base64 (no data: prefix) */
  data: string;
}

export interface LlmRequest {
  prompt: string;
  /** Optional system instruction. */
  system?: string;
  images?: LlmImage[];
  /** Ask for a single JSON object back. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Ledger operation name, e.g. "studio" or "analyze". */
  operation: string;
  /** Skip Gemini (it is handled by the caller, e.g. video breakdowns). */
  skipGemini?: boolean;
  /** Max models to try before giving up. */
  maxAttempts?: number;
  /** Try the full Gemini Flash first (better writing; only ~20 free requests a day), then fall back as usual. */
  premium?: boolean;
}

export interface LlmResult {
  text: string;
  provider: Provider;
  model: string;
}

export class NoFreeModelError extends Error {
  constructor(detail: string) {
    super(`Every free model is busy or out of daily quota right now (${detail}). Nothing was charged; try again in a few minutes.`);
    this.name = "NoFreeModelError";
  }
}

export interface LlmKeys {
  gemini?: string;
  groq?: string;
  openrouter?: string;
}

export function keysFromEnv(env: Record<string, string | undefined> = process.env): LlmKeys {
  return { gemini: env.GEMINI_API_KEY || undefined, groq: env.GROQ_API_KEY || undefined, openrouter: env.OPENROUTER_API_KEY || undefined };
}

// ------------------------------------------------------------------ ranking

/** Models that are not general chat models (speech, safety classifiers, image/music generators…). */
const EXCLUDE = /(whisper|tts|orpheus|lyria|guard|safeguard|embed|transcribe|allam|image-preview|nano-banana|robotics|computer-use|-code|code-|coder|search|audio-only|moderation)/i;
/** Family names that signal flagship quality. */
const BOOST: [RegExp, number][] = [
  [/ultra/i, 30],
  [/\bpro\b|-pro/i, 18],
  [/super/i, 18],
  [/maverick/i, 15],
  [/gpt-oss-120b/i, 22],
  [/deepseek/i, 14],
  [/qwen/i, 10],
  [/gemma-4/i, 8],
  [/llama-4/i, 8],
  [/kimi|glm/i, 10],
];
const PENALTY: [RegExp, number][] = [
  [/nano|tiny|mini|small|lite|lightning|-2b|-1\.?\d*b/i, -18],
  [/preview|experimental|exp\b/i, -3],
];

/** Heuristic quality score from the model id, size, context window and release date. Higher is better. */
export function scoreModel(id: string, opts: { created?: number; context?: number } = {}): number {
  let s = 0;
  // Total parameter size hint, e.g. "550b", "120b", "27b", "a55b" (active params count too).
  const sizes = [...id.toLowerCase().matchAll(/(?:^|[^a-z])a?(\d+(?:\.\d+)?)b(?![a-z])/g)].map((m) => Number(m[1]));
  const size = sizes.length ? Math.max(...sizes) : null;
  if (size != null) s += size < 5 ? -40 : Math.min(35, Math.log2(size) * 5);
  for (const [re, w] of BOOST) if (re.test(id)) s += w;
  for (const [re, w] of PENALTY) if (re.test(id)) s += w;
  if (opts.context) s += Math.min(6, Math.log2(Math.max(1, opts.context / 32_000)) * 2);
  if (opts.created) {
    const months = (opts.created * 1000 - Date.UTC(2025, 0, 1)) / (30 * 864e5);
    s += Math.max(0, Math.min(24, months)) * 0.8;
  }
  return Math.round(s * 10) / 10;
}

// ------------------------------------------------------------------ live model lists (cached)

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; models: FreeModel[]; key: string } | null = null;

interface OpenRouterModel {
  id: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string; request?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
}

async function openRouterFree(): Promise<FreeModel[]> {
  const { data } = await fetchJson<{ data: OpenRouterModel[] }>("https://openrouter.ai/api/v1/models", { timeoutMs: 20_000 });
  return data
    .filter((m) => m.pricing?.prompt === "0" && m.pricing?.completion === "0" && (m.pricing.request ?? "0") === "0")
    .filter((m) => !(m.architecture?.output_modalities ?? ["text"]).some((o) => o !== "text"))
    .filter((m) => m.id !== "openrouter/free" && !EXCLUDE.test(m.id))
    .map((m) => {
      const inputs = m.architecture?.input_modalities ?? ["text"];
      return {
        provider: "openrouter" as const,
        id: m.id,
        vision: inputs.includes("image"),
        video: inputs.includes("video"),
        context: m.context_length ?? 0,
        score: scoreModel(m.id, { created: m.created, context: m.context_length }),
      };
    });
}

async function groqModels(key: string): Promise<FreeModel[]> {
  const { data } = await fetchJson<{ data: { id: string; active?: boolean; context_window?: number; created?: number }[] }>("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    timeoutMs: 20_000,
  });
  return data
    .filter((m) => m.active !== false && !EXCLUDE.test(m.id) && (m.context_window ?? 0) >= 8000)
    .map((m) => ({
      provider: "groq" as const,
      id: m.id,
      vision: /vision|-vl\b|scout|maverick|omni/i.test(m.id),
      video: false,
      context: m.context_window ?? 0,
      // Groq is the whole account's free tier; give it a small bonus over OpenRouter's 50 req/day.
      score: scoreModel(m.id, { created: m.created, context: m.context_window }) + 4,
    }));
}

/** Ranked free models across Groq and OpenRouter, refreshed every 6 hours (or on demand). */
export async function listFreeModels(keys: LlmKeys, opts: { refresh?: boolean } = {}): Promise<FreeModel[]> {
  const cacheKey = `${!!keys.groq}:${!!keys.openrouter}`;
  if (!opts.refresh && cache && cache.key === cacheKey && Date.now() - cache.at < TTL_MS) return cache.models;
  const [g, o] = await Promise.allSettled([keys.groq ? groqModels(keys.groq) : Promise.resolve([]), keys.openrouter ? openRouterFree() : Promise.resolve([])]);
  const models = [...(g.status === "fulfilled" ? g.value : []), ...(o.status === "fulfilled" ? o.value : [])].sort((a, b) => b.score - a.score);
  // Keep the stale list if both lookups failed.
  if (!models.length && cache) return cache.models;
  cache = { at: Date.now(), models, key: cacheKey };
  return models;
}

// ------------------------------------------------------------------ calls

const GEMINI_TEXT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const GEMINI_RPD = 500 * 0.92;
/** Full Flash on the free tier: 5 requests/minute, 20/day. Kept for the writing that matters most. */
const GEMINI_PREMIUM_MODEL = "gemini-3.5-flash";
const GEMINI_PREMIUM_RPD = 18;

async function geminiUsed(db: Queryable): Promise<Map<string, number>> {
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

async function log(db: Queryable, provider: Provider, operation: string, model: string, tokens: number) {
  await db.query("insert into public.cost_ledger (provider, operation, units, usd, meta) values ($1, $2, 1, 0, $3::text::jsonb)", [
    provider,
    `${operation}:${model}`,
    JSON.stringify({ tokens, free_tier: true }),
  ]);
}

async function callGemini(key: string, model: string, req: LlmRequest): Promise<{ text: string; tokens: number }> {
  const parts: Record<string, unknown>[] = (req.images ?? []).map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.data } }));
  parts.push({ text: req.prompt });
  const res = await fetchJson<{ candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { totalTokenCount?: number } }>(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      timeoutMs: 120_000,
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: req.temperature ?? 0.7,
          ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  const text = res.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
  return { text, tokens: res.usageMetadata?.totalTokenCount ?? 0 };
}

async function callOpenAiCompatible(base: string, key: string, model: FreeModel, req: LlmRequest): Promise<{ text: string; tokens: number }> {
  const content: unknown =
    model.vision && req.images?.length
      ? [{ type: "text", text: req.prompt }, ...req.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))]
      : req.prompt;
  const messages = [...(req.system ? [{ role: "system", content: req.system }] : []), { role: "user", content }];
  const res = await fetchJson<{ choices?: { message?: { content?: string | null; reasoning?: string | null } }[]; usage?: { total_tokens?: number }; error?: { message?: string; code?: number } }>(
    `${base}/chat/completions`,
    {
      method: "POST",
      timeoutMs: 90_000,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(model.provider === "openrouter" ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Atria (personal)" } : {}),
      },
      body: JSON.stringify({
        model: model.id,
        messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 2048,
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
    },
  );
  // OpenRouter sometimes returns HTTP 200 with an error body (upstream rate limit).
  if (res.error) throw new HttpError(res.error.code ?? 502, res.error.message ?? "upstream error");
  const text = (res.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new HttpError(502, "empty completion");
  return { text, tokens: res.usage?.total_tokens ?? 0 };
}

/** Status codes that mean "try the next free model" rather than "this request is broken". */
function isSkippable(e: unknown): boolean {
  if (e instanceof HttpError) return [400, 402, 403, 404, 408, 413, 422, 429, 500, 502, 503, 504, 529].includes(e.status);
  return e instanceof Error && /timeout|aborted|fetch failed|JSON/i.test(e.message);
}

/**
 * Generate text with the best available free model. Tries Gemini first (unless skipped),
 * then ranked Groq/OpenRouter models; vision requests prefer vision-capable models.
 */
export async function generate(keys: LlmKeys, db: Queryable, req: LlmRequest): Promise<LlmResult> {
  const errors: string[] = [];
  const maxAttempts = req.maxAttempts ?? 6;
  let attempts = 0;

  if (keys.gemini && !req.skipGemini) {
    const used = await geminiUsed(db);
    for (const model of req.premium ? [GEMINI_PREMIUM_MODEL, ...GEMINI_TEXT_MODELS] : GEMINI_TEXT_MODELS) {
      if ((used.get(model) ?? 0) >= (model === GEMINI_PREMIUM_MODEL ? GEMINI_PREMIUM_RPD : GEMINI_RPD)) continue;
      attempts++;
      try {
        const r = await callGemini(keys.gemini, model, req);
        if (!r.text.trim()) throw new HttpError(502, "empty completion");
        await log(db, "gemini", req.operation, model, r.tokens);
        return { text: r.text, provider: "gemini", model };
      } catch (e) {
        errors.push(`gemini/${model}: ${e instanceof HttpError ? e.status : "error"}`);
        if (!isSkippable(e)) throw e;
      }
    }
  }

  const ranked = await listFreeModels(keys);
  const wantsVision = !!req.images?.length;
  // Vision requests: vision models first, then text models (they still get the copy).
  const ordered = wantsVision ? [...ranked.filter((m) => m.vision), ...ranked.filter((m) => !m.vision)] : ranked;
  // Interleave providers so one provider's outage doesn't burn every attempt.
  const groq = ordered.filter((m) => m.provider === "groq");
  const or = ordered.filter((m) => m.provider === "openrouter");
  const queue: FreeModel[] = [];
  for (let i = 0; i < Math.max(groq.length, or.length); i++) {
    if (wantsVision) {
      if (or[i]) queue.push(or[i]!);
      if (groq[i]) queue.push(groq[i]!);
    } else {
      if (groq[i]) queue.push(groq[i]!);
      if (or[i]) queue.push(or[i]!);
    }
  }

  for (const model of queue) {
    if (attempts >= maxAttempts) break;
    attempts++;
    try {
      const r =
        model.provider === "groq"
          ? await callOpenAiCompatible("https://api.groq.com/openai/v1", keys.groq!, model, req)
          : await callOpenAiCompatible("https://openrouter.ai/api/v1", keys.openrouter!, model, req);
      await log(db, model.provider, req.operation, model.id, r.tokens);
      return { text: r.text, provider: model.provider, model: model.id };
    } catch (e) {
      errors.push(`${model.provider}/${model.id}: ${e instanceof HttpError ? e.status : "error"}`);
      if (!isSkippable(e)) throw e;
    }
  }
  throw new NoFreeModelError(errors.slice(0, 4).join(", ") || "no keys configured");
}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(body.slice(start, end + 1));
}

// ------------------------------------------------------------------ streaming

async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
  if (buf.trim().startsWith("data:")) yield buf.trim().slice(5).trim();
}

async function openStream(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new HttpError(res.status, `${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res;
}

/** Token stream from one model. Throws before the first token if the model can't serve the request. */
async function* streamOne(keys: LlmKeys, m: { provider: Provider; id: string; vision: boolean }, req: LlmRequest): AsyncGenerator<string> {
  if (m.provider === "gemini") {
    const parts: Record<string, unknown>[] = (req.images ?? []).map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.data } }));
    parts.push({ text: req.prompt });
    const res = await openStream(`https://generativelanguage.googleapis.com/v1beta/models/${m.id}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "x-goog-api-key": keys.gemini!, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: req.temperature ?? 0.7, ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}) },
      }),
    });
    for await (const data of sseLines(res)) {
      const j = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const t = j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      if (t) yield t;
    }
    return;
  }
  const base = m.provider === "groq" ? "https://api.groq.com/openai/v1" : "https://openrouter.ai/api/v1";
  const key = m.provider === "groq" ? keys.groq! : keys.openrouter!;
  const content: unknown =
    m.vision && req.images?.length ? [{ type: "text", text: req.prompt }, ...req.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))] : req.prompt;
  const res = await openStream(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(m.provider === "openrouter" ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Atria (personal)" } : {}) },
    body: JSON.stringify({
      model: m.id,
      stream: true,
      messages: [...(req.system ? [{ role: "system", content: req.system }] : []), { role: "user", content }],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048,
    }),
  });
  let inThink = false;
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    const j = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string; code?: number } };
    if (j.error) throw new HttpError(j.error.code ?? 502, j.error.message ?? "upstream error");
    let t = j.choices?.[0]?.delta?.content ?? "";
    // Hide <think>…</think> reasoning some open models emit.
    if (t.includes("<think>")) inThink = true;
    if (inThink) {
      const end = t.indexOf("</think>");
      if (end < 0) continue;
      inThink = false;
      t = t.slice(end + 8);
    }
    if (t) yield t;
  }
}

/**
 * Streamed generation with the same free-model order as `generate`. Falls back to the next model only
 * if one fails before producing any text; `onModel` reports the model that answered.
 */
export async function* generateStream(keys: LlmKeys, db: Queryable, req: LlmRequest, onModel?: (provider: Provider, model: string) => void): AsyncGenerator<string> {
  const candidates: { provider: Provider; id: string; vision: boolean }[] = [];
  if (keys.gemini && !req.skipGemini) {
    const used = await geminiUsed(db);
    for (const id of GEMINI_TEXT_MODELS) if ((used.get(id) ?? 0) < GEMINI_RPD) candidates.push({ provider: "gemini", id, vision: true });
  }
  const ranked = await listFreeModels(keys).catch(() => [] as FreeModel[]);
  const groq = ranked.filter((m) => m.provider === "groq");
  const or = ranked.filter((m) => m.provider === "openrouter");
  for (let i = 0; i < Math.max(groq.length, or.length); i++) {
    if (groq[i]) candidates.push(groq[i]!);
    if (or[i]) candidates.push(or[i]!);
  }
  const errors: string[] = [];
  for (const m of candidates.slice(0, req.maxAttempts ?? 6)) {
    let started = false;
    let chars = 0;
    try {
      for await (const t of streamOne(keys, m, req)) {
        if (!started) {
          started = true;
          onModel?.(m.provider, m.id);
        }
        chars += t.length;
        yield t;
      }
      if (!started) throw new HttpError(502, "empty completion");
      await log(db, m.provider, req.operation, m.id, Math.round(chars / 4));
      return;
    } catch (e) {
      if (started) throw e; // mid-answer failure: surface it rather than mixing two models' text
      errors.push(`${m.provider}/${m.id}: ${e instanceof HttpError ? e.status : "error"}`);
      if (!isSkippable(e)) throw e;
    }
  }
  throw new NoFreeModelError(errors.slice(0, 4).join(", ") || "no keys configured");
}
