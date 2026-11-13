"use server";

import { revalidatePath } from "next/cache";
import type { MyBrand } from "@/lib/my-brand";
import { getSql, isUnavailable } from "@/lib/server/db";
import { readStore, writeStore } from "@/lib/server/my-brand";

export type BrandEdit = Pick<MyBrand, "name" | "url" | "products" | "priceMin" | "priceMax" | "audience" | "voice" | "offers" | "competitors" | "keywords">;

/** Saves your brand profile (Settings). Competitors are tracked so their ads lead the feed and Tracking. */
export async function saveMyBrand(edit: BrandEdit): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!edit.name.trim()) return { ok: false, error: "Brand name is required" };
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  const store = await readStore();
  const cur = store.items.find((b) => b.id === store.activeId);
  if (!cur) return { ok: false, error: "No brand profile" };
  const clip = (v: string, n = 400) => String(v ?? "").trim().slice(0, n);
  const list = (v: string[]) => [...new Set(v.map((x) => clip(x, 60)).filter(Boolean))].slice(0, 20);
  const next: MyBrand = {
    ...cur,
    name: clip(edit.name, 80),
    url: clip(edit.url, 200),
    products: clip(edit.products),
    priceMin: edit.priceMin,
    priceMax: edit.priceMax,
    priceTier: (edit.priceMax ?? edit.priceMin ?? 99) < 40 ? "budget" : (edit.priceMax ?? edit.priceMin ?? 99) <= 140 ? "mid" : (edit.priceMax ?? 0) <= 250 ? "premium" : "luxury",
    audience: clip(edit.audience),
    voice: clip(edit.voice, 200),
    offers: clip(edit.offers, 200),
    competitors: list(edit.competitors),
    keywords: list(edit.keywords),
  };
  await writeStore({ ...store, items: store.items.map((b) => (b.id === cur.id ? next : b)) });
  if (next.competitors.length) {
    const names = next.competitors.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    await sql`update public.brands set status = 'tracked', tracked_at = coalesce(tracked_at, now())
              where merged_into is null and regexp_replace(lower(name), '[^a-z0-9]', '', 'g') in ${sql(names)}`;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
