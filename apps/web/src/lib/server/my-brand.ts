import "server-only";
import { categoryById, normName } from "@signal/shared";
import { emptyBrand, priceBand, type MyBrand } from "@/lib/my-brand";
import type { FeedFit } from "./ads";
import { getSql, isUnavailable } from "./db";

interface Store {
  activeId: string | null;
  items: MyBrand[];
}

const KEY = "my_brands";

/** The legacy single profile (Settings → Brand) becomes the first brand, not yet onboarded. */
async function legacy(sql: Exclude<ReturnType<typeof getSql>, { reason: string }>): Promise<MyBrand | null> {
  const [row] = await sql<{ value: Record<string, string> }[]>`select value from public.app_settings where key = 'brand_profile'`;
  const v = row?.value;
  if (!v?.name) return null;
  return { ...emptyBrand("b1"), name: v.name, products: v.products ?? "", audience: v.audience ?? "", voice: v.voice ?? "", offers: v.offers ?? "" };
}

export async function readStore(): Promise<Store> {
  const sql = getSql();
  if (isUnavailable(sql)) return { activeId: null, items: [] };
  const [row] = await sql<{ value: Store }[]>`select value from public.app_settings where key = ${KEY}`;
  if (row?.value?.items) return { activeId: row.value.activeId, items: row.value.items.map((b) => ({ ...emptyBrand(b.id), ...b })) };
  const old = await legacy(sql);
  return old ? { activeId: old.id, items: [old] } : { activeId: null, items: [] };
}

export async function writeStore(store: Store): Promise<void> {
  const sql = getSql();
  if (isUnavailable(sql)) throw new Error(sql.reason);
  await sql`insert into public.app_settings (key, value) values (${KEY}, ${JSON.stringify(store)}::text::jsonb)
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  // Keep the legacy key in sync: AI Studio, boards and breakdowns read it.
  const a = store.items.find((b) => b.id === store.activeId);
  if (a) {
    const legacyValue = { name: a.name, products: a.products, audience: a.audience, voice: a.voice, offers: a.offers };
    await sql`insert into public.app_settings (key, value) values ('brand_profile', ${JSON.stringify(legacyValue)}::text::jsonb)
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
  }
}

/** The active brand, or null when you haven't onboarded yet. */
export async function getMyBrand(): Promise<MyBrand | null> {
  const s = await readStore();
  const b = s.items.find((x) => x.id === s.activeId) ?? null;
  return b?.onboardedAt ? b : null;
}

/** Same as getMyBrand but also returns an unfinished draft (to prefill onboarding). */
export async function getMyBrandDraft(): Promise<MyBrand | null> {
  const s = await readStore();
  return s.items.find((x) => x.id === s.activeId) ?? null;
}

/** A one-paragraph brief of the brand for AI prompts. */
export function brandBrief(b: MyBrand): string {
  const cat = categoryById(b.category)?.label ?? b.category;
  return [
    `Brand: ${b.name}${b.url ? ` (${b.url})` : ""} — ${cat}.`,
    b.products && `Sells: ${b.products}.`,
    `Price: ${b.priceTier}${b.priceMin != null && b.priceMax != null ? ` (${b.priceMin}–${b.priceMax} ${b.currency})` : ""}.`,
    b.audience && `Audience: ${b.audience}.`,
    b.voice && `Voice: ${b.voice}.`,
    b.offers && `Offers: ${b.offers}.`,
    b.markets.length && `Markets: ${b.markets.join(", ")}.`,
    b.competitors.length && `Competitors / inspiration: ${b.competitors.join(", ")}.`,
    b.goals.length && `Goals: ${b.goals.join(", ")}.`,
    b.aesthetic.length && `Aesthetic: ${b.aesthetic.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Feed personalization for a brand: its competitors' brand ids, price band and keywords. */
export async function feedFitFor(b: MyBrand): Promise<FeedFit> {
  const sql = getSql();
  const norms = b.competitors.map((c) => normName(c)).filter(Boolean);
  const ids =
    norms.length && !isUnavailable(sql)
      ? (await sql<{ id: string }[]>`select id from public.brands where merged_into is null and regexp_replace(lower(name), '[^a-z0-9]', '', 'g') in ${sql(norms)}`).map((r) => r.id)
      : [];
  const [lo, hi] = priceBand(b);
  const words = b.keywords.map((k) => k.replace(/["()]/g, "").trim()).filter(Boolean).slice(0, 8);
  return { brandIds: ids, priceMin: lo, priceMax: hi, terms: words.length ? words.map((w) => (w.includes(" ") ? `"${w}"` : w)).join(" OR ") : null };
}
