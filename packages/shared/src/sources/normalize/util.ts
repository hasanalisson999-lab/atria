import { createHash } from "node:crypto";
import type { AdFormat, AdPlatform } from "../../types.ts";

type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Returns the first present (non-null, non-empty-string) value among the given keys. */
export function pick(o: unknown, ...keys: string[]): unknown {
  if (!isObj(o)) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (isObj(v) && typeof v.text === "string") return str(v.text);
  return null;
}

export function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Accepts unix seconds, unix ms, ISO datetimes or YYYY-MM-DD; returns YYYY-MM-DD (UTC) or null. */
export function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || (typeof v === "string" && /^\d{9,13}$/.test(v))) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }
  return null;
}

/** Unwraps facebook.com/l.php?u=... redirects and returns a clean absolute URL. */
export function cleanUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === "/l.php" && u.searchParams.get("u")) {
      return cleanUrl(u.searchParams.get("u"));
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function domainOf(url: string | null, fallback?: unknown): string | null {
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      /* fall through */
    }
  }
  const f = str(fallback);
  if (f && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(f.replace(/^www\./i, ""))) return f.replace(/^www\./i, "").toLowerCase();
  return null;
}

const PLATFORM_MAP: Record<string, AdPlatform> = {
  facebook: "facebook",
  instagram: "instagram",
  messenger: "messenger",
  audience_network: "audience_network",
  audiencenetwork: "audience_network",
  threads: "threads",
  whatsapp: "whatsapp",
};

export function normalizePlatforms(v: unknown): AdPlatform[] {
  const out = new Set<AdPlatform>();
  for (const p of arr(v)) {
    const key = String(p).toLowerCase().replace(/[\s-]/g, "_");
    const m = PLATFORM_MAP[key] ?? PLATFORM_MAP[key.replace(/_/g, "")];
    if (m) out.add(m);
  }
  return [...out];
}

export function normalizeFormat(displayFormat: unknown, hints: { videos: number; images: number; cards: number }): AdFormat {
  const f = String(displayFormat ?? "").toUpperCase();
  if (f === "DCO" || f === "DPA" || f === "CATALOG") return "dco";
  if (f.includes("CAROUSEL") || f.startsWith("MULTI_")) return "carousel";
  if (f === "VIDEO") return "video";
  if (f === "IMAGE") return "image";
  if (hints.cards > 1) return "carousel";
  if (hints.videos > 0) return "video";
  if (hints.images > 0) return "image";
  return "unknown";
}

/** DCO ads contain template placeholders like {{product.name}} instead of real copy. */
export const isTemplateText = (s: string | null) => !!s && /\{\{\s*product\./i.test(s);

export function textHash(parts: (string | null | undefined)[]): string {
  const norm = parts.map((p) => (p ?? "").toLowerCase().replace(/\s+/g, " ").trim()).join("|");
  return createHash("sha1").update(norm).digest("hex");
}
