export function daysText(d: number | null) {
  if (d === null || d < 0) return null;
  if (d === 0) return "Started today";
  if (d < 365) return `${d} day${d === 1 ? "" : "s"}`;
  const y = Math.floor(d / 365);
  const m = Math.floor((d % 365) / 30);
  return `${y}y${m ? ` ${m}mo` : ""}`;
}

/** Compact age chip like "8d", "3mo", "1y". */
export function ageChip(d: number | null) {
  if (d === null || d < 0) return null;
  if (d === 0) return "today";
  if (d < 60) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${(d / 365).toFixed(d < 730 ? 1 : 0).replace(/\.0$/, "")}y`;
}

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export interface AdReason {
  label: string;
  why: string;
  tone: "hot" | "scaled" | "new" | "tracked";
}

/** Why an ad is worth studying, in one chip (null when there's no strong signal yet). */
export function adReason(ad: { days_running: number | null; is_active: boolean; variants: number; variations_count: number; start_date: string | null; brand_status?: string | null }): AdReason | null {
  const d = ad.days_running ?? 0;
  const versions = Math.max(ad.variants, ad.variations_count);
  if (d >= 90 && ad.is_active) return { label: "Evergreen", why: `Live for ${d} days and still running: it keeps selling.`, tone: "hot" };
  if (versions >= 3) return { label: `Scaled ×${versions}`, why: `Running as ${versions} ads: the brand is putting budget behind it.`, tone: "scaled" };
  if (d >= 30) return { label: "Proven", why: `Ran ${d} days: brands rarely keep losers on for a month.`, tone: "hot" };
  const start = ad.start_date ? Date.parse(`${ad.start_date.slice(0, 10)}T00:00:00Z`) : NaN;
  if (Number.isFinite(start) && Date.now() - start <= 7 * 864e5) return { label: "New launch", why: "Started in the last 7 days: a fresh test to watch.", tone: "new" };
  if (ad.brand_status === "tracked") return { label: "Tracked", why: "From a brand you track.", tone: "tracked" };
  return null;
}
