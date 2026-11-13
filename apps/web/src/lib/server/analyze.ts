import "server-only";
import { FreeTierExhaustedError, NoFreeModelError, analyzeCreativeAny, keysFromEnv, saveAnalysis } from "@signal/shared/ai";
import { fromPostgresJs } from "@signal/shared/db";
import { getSql, isUnavailable } from "./db";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
function sqlOrError() {
  const sql = getSql();
  if (isUnavailable(sql)) throw new Error(sql.reason);
  return sql;
}

// ---------------------------------------------------------------- AI breakdown (Gemini free tier)

// Above ~14 MB a video needs a slow upload round trip; use the still image instead (much faster).
const MAX_MEDIA_BYTES = 14 * 1024 * 1024;

async function download(url: string): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000), referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_MEDIA_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_MEDIA_BYTES || bytes.byteLength < 500) return null;
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0] || (url.includes(".mp4") ? "video/mp4" : "image/jpeg");
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

/** Smaller SD rendition when the scraper captured one (faster + fits inline). */
function sdVideoUrl(raw: unknown): string | null {
  const m = JSON.stringify(raw ?? {}).match(/"video_?[sS]d_?[uU]rl"\s*:\s*"(https:[^"]+)"/);
  return m ? m[1]!.replace(/\\u0026/g, "&").replace(/\\\//g, "/") : null;
}

/** AI breakdown of one ad (video when it fits, else the still + copy), saved to ad_analysis. */
export async function runAnalysis(adId: string): Promise<ActionResult> {
  try {
    if (!UUID.test(adId)) return { ok: false, error: "Invalid ad" };
    const keys = keysFromEnv();
    if (!keys.gemini && !keys.groq && !keys.openrouter) return { ok: false, error: "Add GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY to .env" };
    const sql = sqlOrError();
    const [ad] = await sql<
      { id: string; format: string; headline: string | null; body_text: string | null; cta: string | null; landing_domain: string | null; video_url: string | null; thumbnail_url: string | null; raw: unknown; brand: string | null }[]
    >`select a.id, a.format::text as format, a.headline, a.body_text, a.cta, a.landing_domain, a.video_url, a.thumbnail_url, a.raw, b.name as brand
      from public.ads a left join public.brands b on b.id = a.brand_id where a.id = ${adId}`;
    if (!ad) return { ok: false, error: "Ad not found" };

    const media: { mimeType: string; bytes: Uint8Array }[] = [];
    if (ad.video_url) {
      const v = (await download(sdVideoUrl(ad.raw) ?? ad.video_url)) ?? (await download(ad.video_url));
      if (v) media.push({ ...v, mimeType: v.mimeType.startsWith("video/") ? v.mimeType : "video/mp4" });
    }
    const thumb = ad.thumbnail_url ? await download(ad.thumbnail_url) : null;
    const still = thumb ? { ...thumb, mimeType: thumb.mimeType.startsWith("image/") ? thumb.mimeType : "image/jpeg" } : null;
    if (!media.length && still) media.push(still);
    const profile = await sql<{ value: { name?: string } }[]>`select value from public.app_settings where key = 'brand_profile'`;

    const db = fromPostgresJs(sql);
    const { breakdown, model, provider } = await analyzeCreativeAny(keys, db, {
      brand: ad.brand,
      headline: ad.headline,
      body: ad.body_text,
      cta: ad.cta,
      landingDomain: ad.landing_domain,
      format: ad.format,
      media,
      still,
      forBrand: profile[0]?.value?.name || "Oneletic",
    });
    await saveAnalysis(db, adId, breakdown, model);
    return { ok: true, message: media.length ? `Analyzed with ${model} (${provider}, free)` : "Media link expired; analyzed from the copy only" };
  } catch (e) {
    if (e instanceof FreeTierExhaustedError || e instanceof NoFreeModelError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
}

