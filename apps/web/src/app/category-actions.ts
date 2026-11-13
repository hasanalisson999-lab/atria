"use server";

import { categoryById } from "@signal/shared";
import { after } from "next/server";
import { missingBrands, seedCategoryBrands, seedRegistry, type SeedProgress } from "@/lib/server/category-seed";
import { getSql, isUnavailable } from "@/lib/server/db";

/** Starts pulling a category's brands in the background (returns at once; poll categoryStatus). */
export async function seedCategory(categoryId: string, max = 8): Promise<{ ok: true; started: boolean; remaining: number } | { ok: false; error: string }> {
  if (!categoryById(categoryId)) return { ok: false, error: "Unknown category" };
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  if (seedRegistry.get(categoryId)?.state === "running") return { ok: true, started: false, remaining: 0 };
  const remaining = (await missingBrands(sql, categoryId)).length;
  if (!remaining) return { ok: true, started: false, remaining: 0 };
  seedRegistry.set(categoryId, { state: "running", total: Math.min(max, remaining), done: 0, added: [], skipped: [], ads: 0 });
  after(async () => {
    const update = (p: Partial<SeedProgress>) => seedRegistry.set(categoryId, { ...seedRegistry.get(categoryId)!, ...p });
    try {
      await seedCategoryBrands(sql, categoryId, Math.min(Math.max(max, 1), 12), update);
      update({ state: "done", finishedAt: Date.now() });
    } catch (e) {
      update({ state: "error", error: e instanceof Error ? e.message.slice(0, 200) : String(e), finishedAt: Date.now() });
    }
  });
  return { ok: true, started: true, remaining };
}

export async function categoryStatus(categoryId: string): Promise<SeedProgress | null> {
  return seedRegistry.get(categoryId) ?? null;
}

/** How many catalog brands of a category are not in the library yet. */
export async function categoryRemaining(categoryId: string): Promise<number> {
  const sql = getSql();
  if (isUnavailable(sql)) return 0;
  return (await missingBrands(sql, categoryId)).length;
}
