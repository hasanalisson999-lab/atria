import "server-only";
import { extractJson, generate, keysFromEnv, type LlmKeys } from "@signal/shared/ai";
import { fromPostgresJs } from "@signal/shared/db";
import { cleanAll, cleanText, detectFields, detectSlop, scanOne, setPath, textFields, VOICE_GUIDE, WRITING_GUIDE, type FieldHit } from "@/lib/slop";
import { getSql, isUnavailable } from "./db";
import { brandBrief, feedFitFor, getMyBrand } from "./my-brand";
import { contextBlock, retrieveAds, toSources, type StudioSource } from "./studio";

/** The Brand Lab's AI sections. Each is generated once, saved, and shown instantly afterwards. */
export type LabSection = "scripts" | "positioning" | "branding" | "ideas" | "remix";
export const LAB_SECTIONS: LabSection[] = ["scripts", "positioning", "branding", "ideas", "remix"];

export type ScriptStatus = "idea" | "filmed" | "posted";
export const SCRIPT_PLATFORMS = ["TikTok", "Instagram Reels", "YouTube Shorts", "YouTube"] as const;
export const SCRIPT_LENGTHS = ["15s", "30s", "60s", "3-5 min"] as const;
export const SCRIPT_FORMATS = ["Founder story", "Build in public", "How it works", "Day in the life", "Behind the scenes", "Reply to a comment", "Problem and fix", "Myth vs fact"] as const;

export interface Script {
  id: string;
  platform: string;
  format: string;
  title: string;
  length: string;
  hook: string;
  lines: { t: string; say: string; show: string }[];
  caption: string;
  hashtags: string[];
  status?: ScriptStatus;
  createdAt?: string;
  /** The topic the founder typed, for scripts written on request. */
  topic?: string | null;
}
export interface Scripts {
  scripts: Script[];
}

export interface Positioning {
  oneLiner: string;
  taglines: string[];
  pitch: string;
  shortDescription: string;
  longDescription: string;
  pillars: { title: string; line: string; proof: string[] }[];
  personas: { name: string; who: string; pain: string; promise: string; line: string }[];
  objections: { q: string; a: string }[];
  difference: string;
}
export interface Branding {
  personality: { trait: string; means: string }[];
  voiceDo: string[];
  voiceDont: string[];
  wordsUse: string[];
  wordsAvoid: string[];
  palette: { name: string; hex: string; use: string }[];
  type: { heading: string; body: string; why: string };
  logoIdeas: { name: string; concept: string }[];
  modelNames: { name: string; why: string }[];
  photography: string[];
}
export interface Ideas {
  concepts: { title: string; format: string; hook: string; beats: string[]; why: string; inspiredBy: string[] }[];
}
export interface Remix {
  original: string;
  versions: { angle: string; hook: string; beats: string[]; copy: string }[];
}

export interface LabEntry<T = unknown> {
  data: T;
  sources: StudioSource[];
  model: string;
  createdAt: string;
  /** Profile fingerprint at generation time: a changed profile marks the section as outdated. */
  profile: string;
  /** Lines the human-check pass rewrote on the last generation. */
  fixed?: number;
}

const RULES = `FACT RULES:
- Write for the brand below. Specific and usable today.
- The product's materials, technologies and specs are NOT known yet. Never invent them (no made-up foam names, weights, drop, patents). Talk about what it's for and how it should feel to wear; if a spec is needed write a placeholder in square brackets, e.g. [cushioning material].
- Never invent reviews, awards, numbers, celebrity endorsements or prices beyond the brief.
- Return ONE JSON object exactly in the requested shape. No markdown.`;

/** First complete JSON object in a model's answer (ignores anything before or after it). */
function firstObject(text: string): Record<string, unknown> {
  try {
    const v = extractJson(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through to a manual scan */
  }
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No JSON in the answer");
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
  }
  throw new Error("The answer was cut off");
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const fingerprint = (brief: string) => String(hash(brief));
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const LENGTH_GUIDE: Record<string, string> = {
  "15s": "15 seconds: 4-5 lines, about 35-40 spoken words in total.",
  "30s": "30 seconds: 6-8 lines, about 70-80 spoken words in total.",
  "60s": "60 seconds: 8-12 lines, about 140-160 spoken words in total.",
  "3-5 min": "3-5 minutes for YouTube: 14-22 lines, 450-700 spoken words, with a clear middle (the build, the problem, what you tried) and a real ending.",
};

const SCRIPT_SHAPE = `{"platform": "TikTok | Instagram Reels | YouTube Shorts | YouTube", "format": "Founder story | Build in public | How it works | Day in the life | Behind the scenes | Reply to a comment | Problem and fix | Myth vs fact", "title": "short internal name, 2-6 words", "length": "15s | 30s | 60s | 3-5 min", "hook": "the first sentence, said in the first 2 seconds; it is also lines[0].say", "lines": [{"t": "0-3s", "say": "exactly what the founder says, first person, spoken words", "show": "what's on screen, written to the founder as 'you': the shot, B-roll or on-screen text"}], "caption": "post caption, under 150 characters, sounds like a person", "hashtags": [4-6 hashtags without spaces, each starting with #]}`;

const FOUNDER = `The founder is 17 and is building this brand from scratch. The shoe isn't on sale yet. Scripts are spoken by the founder, first person, on camera, for organic TikTok, Reels and YouTube (not ads). The goal is followers who want to see the launch, so end with a plain, specific reason to follow.
Spoken words must fit the length: about 2.5 words per second.`;

function shape(section: LabSection): string {
  switch (section) {
    case "scripts":
      return `{"scripts": [6 x ${SCRIPT_SHAPE}]} — the six: (1) founder intro: "I'm 17 and I'm building my own shoe brand", 30s; (2) how the shoe is meant to work and what problem it solves, 30s; (3) build-in-public progress update with [placeholders] for the real progress, 30s; (4) one shoe for school, the gym and walking, problem and fix, 15s; (5) a day in the life of a 17-year-old founder, 60s; (6) the long YouTube version of the whole story so far, 3-5 min. Platforms: (1) TikTok, (2) Instagram Reels, (3) TikTok, (4) YouTube Shorts, (5) TikTok, (6) YouTube.`;
    case "positioning":
      return `{"oneLiner": "what it is and why someone would want it, max 14 words",
 "taglines": [6 short taglines, max 6 words each, varied styles, no puns that need explaining],
 "pitch": "2-sentence elevator pitch, said out loud to a friend's parent",
 "shortDescription": "40-60 word product description for ads",
 "longDescription": "120-160 word product page description, 2 short paragraphs",
 "pillars": [3 x {"title": "2-3 words", "line": "one sentence", "proof": [2-3 concrete ways to show it in a video]}],
 "personas": [3 x {"name": "e.g. The Walker", "who": "...", "pain": "...", "promise": "...", "line": "an ad line that speaks to them"}] — cover walking/commuting, the gym, and school/everyday,
 "objections": [4 x {"q": "a buyer's doubt, in their words", "a": "short honest answer"}],
 "difference": "2 sentences on how to stand apart from the competitors' messaging in the evidence, naming them"}`;
    case "branding":
      return `{"personality": [3 x {"trait": "one word", "means": "what it means in practice, one sentence with an example"}],
 "voiceDo": [5 short rules], "voiceDont": [5 short rules],
 "wordsUse": [10 words/phrases], "wordsAvoid": [8 words/phrases],
 "palette": [5 x {"name": "colour name", "hex": "#RRGGBB", "use": "where to use it"}],
 "type": {"heading": "a free Google Font family name, exactly as on Google Fonts", "body": "a free Google Font family name, exactly as on Google Fonts", "why": "one sentence"},
 "logoIdeas": [3 x {"name": "concept name", "concept": "2 sentences describing the mark so a designer could sketch it"}],
 "modelNames": [6 x {"name": "name for the first shoe model", "why": "short reason"}],
 "photography": [5 short art-direction rules for photos and video]}`;
    case "ideas":
      return `{"concepts": [8 x {"title": "concept name", "format": "UGC | Demo | Comparison | Founder | Lifestyle | Problem-solution | Day-in-the-life | Unboxing", "hook": "the first line said or shown in the first 2 seconds", "beats": [3-5 short scene beats], "why": "why it should work, naming the mechanism it borrows from the evidence", "inspiredBy": ["A3", ...refs of the evidence ads it borrows from, may be empty]}]} — mix formats; at least 3 must work for a launch with no reviews yet.`;
    case "remix":
      return `{"original": "one sentence on why the original ad [A1] works",
 "versions": [3 x {"angle": "the angle in 3-6 words", "hook": "opening line", "beats": [3-5 scene beats], "copy": "primary text, max 60 words"}]}`;
  }
}

function task(section: LabSection): string {
  switch (section) {
    case "scripts":
      return `TASK: Write 6 organic short-form video scripts. ${FOUNDER} Each hook must make someone stop scrolling in 2 seconds with something specific (a fact, a thing in your hand, a real problem), not a hype line. Use the evidence ads only as inspiration for pacing.`;
    case "positioning":
      return "TASK: Define how to describe this shoe: what it is, why it matters to the buyer, and how to talk to each kind of buyer.";
    case "branding":
      return "TASK: Build the brand identity direction: personality, voice, words, colours, type, logo concepts, names for the first shoe model, and visual direction. It must feel distinct from the competitors in the evidence.";
    case "ideas":
      return "TASK: Give 8 ready-to-shoot ad concepts for launching this shoe. Borrow mechanisms (not content) from the proven ads in the evidence and cite them by ref.";
    case "remix":
      return "TASK: Remix ad [A1] for this brand: keep what makes it work, change everything brand-specific.";
  }
}

const systemFor = (section: LabSection) => (section === "scripts" ? `${WRITING_GUIDE}\n\n${VOICE_GUIDE}` : WRITING_GUIDE);

// ------------------------------------------------------------------ storage

const keyFor = (section: LabSection, adId?: string | null) => (section === "remix" ? `lab:remix:${adId}` : `lab:${section}`);

/** Old saved scripts have no id or status yet. */
function normalizeScripts(list: unknown): Script[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s): s is Script => !!s && typeof s === "object" && typeof (s as Script).hook === "string")
    .map((s, i) => ({
      ...s,
      id: typeof s.id === "string" && s.id ? s.id : `s${hash(`${s.title}|${s.hook}|${i}`)}`,
      lines: Array.isArray(s.lines) ? s.lines.filter((l) => l && typeof l.say === "string").map((l) => ({ t: String(l.t ?? ""), say: l.say, show: String(l.show ?? "") })) : [],
      hashtags: (Array.isArray(s.hashtags) ? s.hashtags : []).map((h) => String(h).trim().replace(/^#?/, "#").replace(/\s+/g, "")).filter((h) => h.length > 1),
      status: s.status === "filmed" || s.status === "posted" ? s.status : "idea",
    }));
}

function normalize(section: LabSection, entry: LabEntry | null): LabEntry | null {
  if (!entry) return null;
  if (section === "scripts") return { ...entry, data: { scripts: normalizeScripts((entry.data as Scripts | undefined)?.scripts) } };
  return entry;
}

/** Cached section for the active brand (null when it hasn't been generated yet). */
export async function readLab(section: LabSection, adId?: string | null): Promise<LabEntry | null> {
  const sql = getSql();
  if (isUnavailable(sql)) return null;
  const [row] = await sql<{ value: LabEntry }[]>`select value from public.app_settings where key = ${keyFor(section, adId)}`;
  return normalize(section, row?.value ?? null);
}

export async function readAllLab(): Promise<{ entries: Partial<Record<LabSection, LabEntry>>; profile: string }> {
  const sql = getSql();
  const me = await getMyBrand();
  const profile = me ? fingerprint(brandBrief(me)) : "";
  if (isUnavailable(sql)) return { entries: {}, profile };
  const rows = await sql<{ key: string; value: LabEntry }[]>`select key, value from public.app_settings where key in ('lab:scripts', 'lab:positioning', 'lab:branding', 'lab:ideas')`;
  return { entries: Object.fromEntries(rows.map((r) => [r.key.slice(4), normalize(r.key.slice(4) as LabSection, r.value)])), profile };
}

async function save(section: LabSection, entry: LabEntry, adId?: string | null) {
  const sql = getSql();
  if (isUnavailable(sql)) throw new Error(sql.reason);
  await sql`insert into public.app_settings (key, value) values (${keyFor(section, adId)}, ${JSON.stringify(entry)}::text::jsonb)
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

// ------------------------------------------------------------------ human check (no-ai-slop edit pass)

/** Hits for a generated object. Each script is checked on its own, so thresholds don't add up across scripts. */
function hitsFor(data: Record<string, unknown>): FieldHit[] {
  if (Array.isArray(data.scripts)) return (data.scripts as unknown[]).flatMap((s, i) => detectFields(textFields(s, `scripts.${i}`)));
  return detectFields(textFields(data));
}

const COUNTED = new Set(["adverb", "exclaim", "emoji", "stiff"]);

const EDITOR = `You are a sharp human editor following the no-ai-slop guide. Fix ONLY the flagged problems in each line below.
- Make the minimum effective edit. Keep the meaning, the facts, the speaker's voice and every [bracketed placeholder] exactly.
- Don't add claims, numbers, examples or opinions. If fixing a problem means cutting a phrase, cut it.
- Spoken lines must still sound like a 17-year-old talking to their phone. Directions stay written to "you".
- "Made-up detail" means the AI invented a fact about the founder: replace it with a short [placeholder] or cut it.
- Return {"fixes": [{"id": "the line id", "text": "the edited line"}]} with one entry per line.`;

/**
 * Finds AI patterns in a generated object and has the model rewrite only those lines (up to two rounds).
 * A rewrite is kept only when it has fewer problems than the original line. Returns how many lines changed.
 */
async function humanize(keys: LlmKeys, db: ReturnType<typeof fromPostgresJs>, data: Record<string, unknown>, operation: string): Promise<number> {
  cleanAll(data);
  let changed = 0;
  for (let round = 0; round < 2; round++) {
    const hits = hitsFor(data);
    if (!hits.length) break;
    const byPath = new Map<string, FieldHit[]>();
    for (const h of hits) byPath.set(h.path, [...(byPath.get(h.path) ?? []), h]);
    const fields = new Map(textFields(data).map((f) => [f.path, f]));
    const items = [...byPath.entries()].slice(0, 40).map(([path, hs]) => ({
      id: path,
      kind: fields.get(path)?.kind === "say" ? "spoken line" : fields.get(path)?.kind === "show" ? "on-screen direction" : "copy",
      text: fields.get(path)?.text ?? "",
      problems: [...new Set(hs.map((h) => `${h.label} ("${h.match}"): ${h.fix}`))],
    }));
    let fixes: { id: string; text: string }[] = [];
    try {
      const r = await generate(keys, db, { system: WRITING_GUIDE, prompt: `${EDITOR}\n\nLINES:\n${JSON.stringify(items, null, 1)}`, json: true, temperature: 0.3, maxTokens: 3000, operation, maxAttempts: 3 });
      const o = firstObject(r.text);
      fixes = Array.isArray(o.fixes) ? (o.fixes as { id: string; text: string }[]) : [];
    } catch {
      break;
    }
    let roundChanged = 0;
    for (const f of fixes) {
      const field = typeof f?.id === "string" ? fields.get(f.id) : undefined;
      if (!field || typeof f.text !== "string" || !f.text.trim()) continue;
      const next = cleanText(f.text);
      // Placeholders must survive the edit.
      const ph = (s: string) => (s.match(/\[[^\]]+\]/g) ?? []).length;
      if (ph(next) < ph(field.text) || next.length < field.text.length * 0.35) continue;
      const flagged = byPath.get(field.path) ?? [];
      const ids = new Set(flagged.map((h) => h.id));
      // Count-based rules (filler adverbs, "!") only count when they were flagged on this line before.
      const after = scanOne(next, field.kind).filter((h) => !COUNTED.has(h.id) || ids.has(h.id)).length;
      const before = flagged.length;
      if (after < before && next !== field.text && setPath(data, field.path, next)) roundChanged++;
    }
    changed += roundChanged;
    if (!roundChanged) break;
  }
  return changed;
}

/**
 * Fills placeholders for facts the brand profile already knows (the price), which models sometimes leave
 * as "[price]" anyway. Runs on every string of a generated object, in place.
 */
export function fillKnown(data: unknown, price: { min: number | null; max: number | null }): void {
  if (price.min == null && price.max == null) return;
  const lo = price.min ?? price.max!;
  const hi = price.max ?? price.min!;
  const mid = String(Math.round((lo + hi) / 2 / 5) * 5 - (Math.round((lo + hi) / 2 / 5) * 5 > 10 ? 1 : 0));
  for (const f of textFields(data)) {
    const next = f.text
      .replace(/\[(?:min(?:imum)?|lowest|starting) price\]/gi, String(lo))
      .replace(/\[(?:max(?:imum)?|highest) price\]/gi, String(hi))
      .replace(/\$?\[(?:target |retail |the |final |launch )?price(?: point)?\]/gi, () => `$${mid}`)
      .replace(/\$?(\d+) dollars/g, (_m, n: string) => `$${n}`)
      .replace(/\${2,}/g, "$");
    if (next !== f.text) setPath(data, f.path, next);
  }
}

// ------------------------------------------------------------------ generation

async function context() {
  const sql = getSql();
  if (isUnavailable(sql)) throw new Error(sql.reason);
  const me = await getMyBrand();
  if (!me) throw new Error("Set up your brand in Settings first");
  const keys = keysFromEnv();
  if (!keys.gemini && !keys.groq && !keys.openrouter) throw new Error("Add GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY to .env");
  return { sql, me, keys, brief: brandBrief(me), db: fromPostgresJs(sql) };
}

async function ask(ctx: Awaited<ReturnType<typeof context>>, req: { system: string; prompt: string; temperature: number; maxTokens: number; operation: string; premium?: boolean }) {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await generate(ctx.keys, ctx.db, { ...req, json: true, maxAttempts: 4 });
      return { data: firstObject(r.text), model: r.model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("The free models couldn't write this right now. Try again in a minute.");
}

function freshScripts(raw: unknown, topic: string | null): Script[] {
  const now = new Date().toISOString();
  return normalizeScripts(raw).map((s) => ({ ...s, id: newId(), status: "idea" as const, createdAt: now, topic }));
}

/** Generates (or regenerates) one section with the free LLM router, grounded in competitors' real ads. */
export async function generateLab(
  section: LabSection,
  opts: { adId?: string | null; topic?: string | null; platform?: string | null; length?: string | null; format?: string | null } = {},
): Promise<LabEntry> {
  const ctx = await context();
  const { sql, me, brief } = ctx;
  const custom = section === "scripts" && opts.topic ? opts.topic.slice(0, 600) : null;
  const fit = await feedFitFor(me);
  const question = section === "remix" ? "remix this ad" : `${me.products} ${me.keywords.join(" ")} everyday comfort walking gym launch`;
  const rows = custom
    ? []
    : await retrieveAds(sql, question, { niche: section === "remix" ? null : me.category, brandIds: section === "remix" ? [] : fit.brandIds.slice(0, 12) }, { adId: opts.adId ?? null, limit: section === "ideas" ? 20 : section === "remix" ? 1 : 14 });
  if (section === "remix" && !rows.length) throw new Error("That ad isn't in the library");

  let prompt: string;
  if (custom) {
    const platform = SCRIPT_PLATFORMS.includes(opts.platform as never) ? opts.platform! : "TikTok";
    const length = SCRIPT_LENGTHS.includes(opts.length as never) ? opts.length! : platform === "YouTube" ? "3-5 min" : "30s";
    const format = SCRIPT_FORMATS.includes(opts.format as never) ? opts.format : null;
    prompt = `TASK: Write ONE organic video script about: "${custom}". Platform: ${platform}. Length: ${LENGTH_GUIDE[length]}${format ? ` Format: ${format}.` : ""} ${FOUNDER}
Only state facts that are in the topic or the brand brief. Anything else about the founder's real story goes in [placeholders].

BRAND
${brief}

${RULES}

Return this JSON shape:
{"scripts": [1 x ${SCRIPT_SHAPE}]}`;
  } else {
    prompt = `${task(section)}

BRAND
${brief}

EVIDENCE: real ads from the library (competitors and the category)
${contextBlock(rows) || "(none)"}

${RULES}

Return this JSON shape:
${shape(section)}`;
  }

  const { data, model } = await ask(ctx, {
    system: systemFor(section),
    prompt,
    temperature: section === "branding" || section === "ideas" ? 0.85 : 0.75,
    maxTokens: section === "ideas" || section === "scripts" ? 8000 : 4000,
    operation: `lab-${section}`,
    premium: section === "scripts",
  });
  if (section === "scripts") data.scripts = freshScripts(data.scripts, custom);
  if (section === "scripts" && !(data.scripts as Script[]).length) throw new Error("The model didn't return a script. Try again.");
  fillKnown(data, { min: me.priceMin, max: me.priceMax });
  const fixed = await humanize(ctx.keys, ctx.db, data, `lab-${section}-check`);

  const entry: LabEntry = { data, sources: toSources(rows), model, createdAt: new Date().toISOString(), profile: fingerprint(brief), fixed };
  if (section === "scripts") {
    // New scripts join the top of the saved list; nothing the founder kept is thrown away.
    const prev = await readLab("scripts");
    const prevList = (prev?.data as Scripts | undefined)?.scripts ?? [];
    entry.data = { scripts: [...(data.scripts as Script[]), ...prevList].slice(0, 60) };
    if (prev && custom) {
      entry.sources = prev.sources;
      entry.createdAt = prev.createdAt;
      entry.model = prev.model;
    }
  }
  await save(section, entry, opts.adId);
  return entry;
}

// ------------------------------------------------------------------ single-script tools

async function scriptsEntry(): Promise<LabEntry<Scripts>> {
  const e = await readLab("scripts");
  if (!e) throw new Error("No scripts yet");
  return e as LabEntry<Scripts>;
}

export interface ScriptPatch {
  status?: ScriptStatus;
  title?: string;
  hook?: string;
  caption?: string;
  hashtags?: string[];
  lines?: { t: string; say: string; show: string }[];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Saves the founder's own edits to one script (status, title, hook, lines, caption, hashtags). Unknown fields are ignored. */
export async function updateScript(id: string, patch: ScriptPatch): Promise<LabEntry> {
  const e = await scriptsEntry();
  const s = e.data.scripts.find((x) => x.id === id);
  if (!s) throw new Error("Script not found");
  if (patch.status && ["idea", "filmed", "posted"].includes(patch.status)) s.status = patch.status;
  const title = str(patch.title, 160)?.trim();
  if (title) s.title = title;
  const hook = str(patch.hook, 600);
  if (hook !== undefined) s.hook = hook.trim();
  const caption = str(patch.caption, 2200);
  if (caption !== undefined) s.caption = caption.trim();
  if (Array.isArray(patch.hashtags))
    s.hashtags = patch.hashtags
      .map((h) => String(h).trim().replace(/^#*/, "#").replace(/\s+/g, ""))
      .filter((h) => h.length > 1)
      .slice(0, 30);
  if (Array.isArray(patch.lines))
    s.lines = patch.lines.slice(0, 80).map((l) => ({ t: str(l?.t, 20) ?? "", say: str(l?.say, 2000) ?? "", show: str(l?.show, 1000) ?? "" }));
  // An empty first line can't be the hook any more; fall back to the first spoken line.
  if (!s.hook.trim()) s.hook = s.lines.find((l) => l.say.trim())?.say ?? "";
  await save("scripts", e);
  return e;
}

export async function deleteScript(id: string): Promise<LabEntry> {
  const e = await scriptsEntry();
  e.data.scripts = e.data.scripts.filter((x) => x.id !== id);
  await save("scripts", e);
  return e;
}

/** Rewrites one script following the founder's instruction ("shorter", "stronger hook"…), then runs the human check. */
export async function reviseScript(id: string, instruction: string): Promise<LabEntry> {
  const ctx = await context();
  const e = await scriptsEntry();
  const idx = e.data.scripts.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("Script not found");
  const old = e.data.scripts[idx]!;
  const { status, createdAt, topic } = old;
  const body = { platform: old.platform, format: old.format, title: old.title, length: old.length, hook: old.hook, lines: old.lines, caption: old.caption, hashtags: old.hashtags };
  const prompt = `TASK: Revise this organic video script. The founder's instruction: "${instruction.slice(0, 400)}".
Change what the instruction asks for and nothing else. Keep it the same platform unless told otherwise. ${FOUNDER}
Keep every [placeholder] unless the instruction fills it in. Only state facts that are in the script, the instruction or the brand brief.

BRAND
${ctx.brief}

SCRIPT
${JSON.stringify(body)}

${RULES}

Return this JSON shape:
{"scripts": [1 x ${SCRIPT_SHAPE}]}`;
  const { data } = await ask(ctx, { system: systemFor("scripts"), prompt, temperature: 0.6, maxTokens: 5000, operation: "lab-script-revise", premium: true });
  const [next] = normalizeScripts(data.scripts);
  if (!next) throw new Error("The model didn't return a script. Try again.");
  const wrapped = { scripts: [next] } as Record<string, unknown>;
  fillKnown(wrapped, { min: ctx.me.priceMin, max: ctx.me.priceMax });
  await humanize(ctx.keys, ctx.db, wrapped, "lab-scripts-check");
  const revised = (wrapped.scripts as Script[])[0]!;
  e.data.scripts[idx] = { ...revised, id: old.id, status, createdAt, topic };
  await save("scripts", e);
  return e;
}

// ------------------------------------------------------------------ Human check tool (paste any text)

/** The no-ai-slop "Edit" job on the founder's own text: minimum effective edit, voice kept, plus what changed. */
export async function humanizeText(text: string, kind: "script" | "caption" | "copy"): Promise<{ text: string; changes: string[]; model: string }> {
  const ctx = await context();
  const hits = detectSlop(text, kind === "script" ? "say" : "copy");
  const prompt = `You are a sharp human editor. Edit the draft below into sharper, more human writing while keeping the writer's voice.
- Make the minimum effective edit. Fix AI patterns, errors, repetition and unclear passages. Leave strong human sentences alone.
- Keep the writer's point, vocabulary, cadence, bluntness, humor and uncertainty. Don't invent claims, examples, stats or opinions.
- Keep line breaks, [bracketed placeholders], hashtags and @mentions.
- ${kind === "script" ? "It's a script a 17-year-old founder will say on camera: it must sound natural out loud." : kind === "caption" ? "It's a social media caption: keep it short." : "It's marketing copy for the brand below."}
${hits.length ? `\nThe automatic check already found:\n${hits.map((h) => `- ${h.label} ("${h.match}"): ${h.fix}`).join("\n")}\n` : ""}
BRAND
${ctx.brief}

DRAFT
"""
${text.slice(0, 6000)}
"""

Return {"text": "the full edited draft", "changes": ["short notes on what changed and why, max 6"]}`;
  const { data, model } = await ask(ctx, { system: WRITING_GUIDE, prompt, temperature: 0.4, maxTokens: 4000, operation: "lab-humanize", premium: true });
  const out = typeof data.text === "string" && data.text.trim() ? data.text : text;
  // Keep line structure; only fix dashes and doubled spaces per line.
  const cleaned = out
    .split("\n")
    .map((l) => (l.trim() ? cleanText(l) : ""))
    .join("\n");
  return { text: cleaned, changes: Array.isArray(data.changes) ? (data.changes as unknown[]).map(String).slice(0, 6) : [], model };
}
/** Re-runs the human check on a saved section and rewrites only the flagged lines (nothing else changes). */
export async function fixLab(section: LabSection, adId?: string | null): Promise<LabEntry> {
  const ctx = await context();
  const entry = await readLab(section, adId);
  if (!entry) throw new Error("Nothing written here yet");
  const data = entry.data as Record<string, unknown>;
  fillKnown(data, { min: ctx.me.priceMin, max: ctx.me.priceMax });
  const fixed = await humanize(ctx.keys, ctx.db, data, `lab-${section}-check`);
  const next: LabEntry = { ...entry, data, fixed: (entry.fixed ?? 0) + fixed };
  await save(section, next, adId);
  return next;
}

/** Saves one hand-edited string of a saved section (positioning, branding, ideas, remix) by its path. */
export async function editLab(section: LabSection, path: string, value: string, adId?: string | null): Promise<void> {
  if (section === "scripts") throw new Error("Scripts are edited per script");
  if (!/^[A-Za-z]+(\.(\d{1,3}|[A-Za-z]+)){0,4}$/.test(path)) throw new Error("Bad path");
  const entry = await readLab(section, adId);
  if (!entry) throw new Error("Nothing written here yet");
  const data = entry.data as Record<string, unknown>;
  if (!setPath(data, path, value.slice(0, 4000))) throw new Error("That field doesn't exist");
  await save(section, { ...entry, data }, adId);
}
