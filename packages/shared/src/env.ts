import { z } from "zod";

/**
 * Env handling. Values are NEVER logged or returned to the UI — only "configured / missing".
 */

export type EnvGroup = "supabase" | "database" | "r2" | "gemini" | "llm" | "scrapers" | "anthropic" | "voyage" | "transcription" | "meta" | "apify" | "guardrails";

interface EnvKeySpec {
  key: string;
  group: EnvGroup;
  label: string;
  /** Phase in which the key becomes required. */
  phase: number;
  optional?: boolean;
  /** Extra validity check beyond "non-empty". Returns a reason when invalid. */
  check?: (value: string) => string | null;
}

const placeholderCheck = (v: string) => (/\[YOUR-PASSWORD\]|<.*?>/.test(v) ? "contains a placeholder" : null);
const urlCheck = (v: string) => {
  try {
    new URL(v);
    return null;
  } catch {
    return "is not a valid URL";
  }
};

export const ENV_KEYS: EnvKeySpec[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", group: "supabase", label: "Supabase URL", phase: 0, check: urlCheck },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "supabase", label: "Supabase publishable key", phase: 0 },
  { key: "SUPABASE_SERVICE_ROLE_KEY", group: "supabase", label: "Supabase secret key", phase: 0 },
  { key: "DATABASE_URL", group: "database", label: "Postgres connection string", phase: 0, check: (v) => placeholderCheck(v) ?? urlCheck(v) },
  { key: "R2_ACCOUNT_ID", group: "r2", label: "R2 account ID", phase: 0 },
  { key: "R2_ACCESS_KEY_ID", group: "r2", label: "R2 access key ID", phase: 0 },
  { key: "R2_SECRET_ACCESS_KEY", group: "r2", label: "R2 secret access key", phase: 0 },
  { key: "R2_BUCKET", group: "r2", label: "R2 bucket", phase: 0 },
  { key: "APIFY_TOKEN", group: "apify", label: "Apify token", phase: 0 },
  { key: "APIFY_ACTOR_ID", group: "apify", label: "Apify actor (chosen after benchmark)", phase: 1 },
  { key: "META_APP_ID", group: "meta", label: "Meta app ID", phase: 1, optional: true },
  { key: "META_ACCESS_TOKEN", group: "meta", label: "Meta access token", phase: 1, optional: true },
  { key: "GEMINI_API_KEY", group: "gemini", label: "Gemini API key (free tier: analysis + transcription)", phase: 2 },
  { key: "GROQ_API_KEY", group: "llm", label: "Groq API key (free models, fast fallback)", phase: 2, optional: true },
  { key: "OPENROUTER_API_KEY", group: "llm", label: "OpenRouter API key (free :free models)", phase: 2, optional: true },
  { key: "SERPAPI_API_KEY", group: "scrapers", label: "SerpApi key (Meta Ad Library, 250/mo free)", phase: 1, optional: true },
  { key: "SEARCHAPI_API_KEY", group: "scrapers", label: "SearchAPI.io key (100 free)", phase: 1, optional: true },
  { key: "SCRAPECREATORS_API_KEY", group: "scrapers", label: "ScrapeCreators key (100 free credits)", phase: 1, optional: true },
  { key: "SOCIALCRAWL_API_KEY", group: "scrapers", label: "SocialCrawl key (100 free credits)", phase: 1, optional: true },
  { key: "SOCIALFETCH_API_KEY", group: "scrapers", label: "Social Fetch key (100 free credits)", phase: 1, optional: true },
  { key: "BRIGHTDATA_API_TOKEN", group: "scrapers", label: "Bright Data API token (free credits)", phase: 1, optional: true },
  { key: "PARSE_API_KEY", group: "scrapers", label: "Parse (parse.bot) key (200 free credits)", phase: 1, optional: true },
  { key: "ADSPO_API_KEY", group: "scrapers", label: "Adspo key (10,000 free credits / year)", phase: 1, optional: true },
  { key: "ADYNTEL_API_KEY", group: "scrapers", label: "Adyntel key (50 free credits)", phase: 1, optional: true },
  { key: "ADYNTEL_EMAIL", group: "scrapers", label: "Adyntel account email", phase: 1, optional: true },
  { key: "METAPI_API_KEY", group: "scrapers", label: "Metapi key (3,000 ads/month free)", phase: 1, optional: true },
  { key: "ANTHROPIC_API_KEY", group: "anthropic", label: "Anthropic API key (paid, not used in free mode)", phase: 2, optional: true },
  { key: "VOYAGE_API_KEY", group: "voyage", label: "Voyage AI API key", phase: 2 },
  { key: "ELEVENLABS_API_KEY", group: "transcription", label: "ElevenLabs API key (optional; Gemini transcribes in free mode)", phase: 2, optional: true },
  { key: "OPENAI_API_KEY", group: "transcription", label: "OpenAI API key (alt transcriber)", phase: 2, optional: true },
  { key: "MONTHLY_BUDGET_USD", group: "guardrails", label: "Monthly budget per provider (USD)", phase: 0 },
  { key: "WINNER_MIN_DAYS", group: "guardrails", label: "Winner minimum days running", phase: 0 },
];

export interface EnvKeyStatus {
  key: string;
  group: EnvGroup;
  label: string;
  phase: number;
  optional: boolean;
  state: "configured" | "missing" | "invalid";
  reason?: string;
}

export function envStatus(env: Record<string, string | undefined> = process.env): EnvKeyStatus[] {
  return ENV_KEYS.map((spec) => {
    const raw = env[spec.key]?.trim();
    const base = { key: spec.key, group: spec.group, label: spec.label, phase: spec.phase, optional: !!spec.optional };
    if (!raw) return { ...base, state: "missing" as const };
    const reason = spec.check?.(raw) ?? null;
    return reason ? { ...base, state: "invalid" as const, reason } : { ...base, state: "configured" as const };
  });
}

export class EnvError extends Error {
  constructor(public readonly problems: { key: string; reason: string }[]) {
    super(
      "Environment is not ready:\n" +
        problems.map((p) => `  - ${p.key}: ${p.reason}`).join("\n") +
        "\nFill these in the repo-root .env (see .env.example).",
    );
    this.name = "EnvError";
  }
}

/** Throws EnvError (listing key names only, never values) unless every key in `keys` is valid. */
export function requireEnv<K extends string>(keys: readonly K[], env: Record<string, string | undefined> = process.env): Record<K, string> {
  const statuses = new Map(envStatus(env).map((s) => [s.key, s]));
  const problems: { key: string; reason: string }[] = [];
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const value = env[key]?.trim();
    const st = statuses.get(key);
    if (!value) problems.push({ key, reason: "missing" });
    else if (st?.state === "invalid") problems.push({ key, reason: st.reason ?? "invalid" });
    else out[key] = value;
  }
  if (problems.length) throw new EnvError(problems);
  return out;
}

const guardrailsSchema = z.object({
  MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(50),
  WINNER_MIN_DAYS: z.coerce.number().int().positive().default(30),
  APPROVAL_THRESHOLD_USD: z.coerce.number().nonnegative().default(5),
});
export type Guardrails = z.infer<typeof guardrailsSchema>;

export function guardrails(env: Record<string, string | undefined> = process.env): Guardrails {
  return guardrailsSchema.parse({
    MONTHLY_BUDGET_USD: env.MONTHLY_BUDGET_USD || undefined,
    WINNER_MIN_DAYS: env.WINNER_MIN_DAYS || undefined,
    APPROVAL_THRESHOLD_USD: env.APPROVAL_THRESHOLD_USD || undefined,
  });
}

