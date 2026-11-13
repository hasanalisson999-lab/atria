import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Queryable } from "../src/db/client.ts";
import { HttpError } from "../src/retry.ts";
import { fetchWithFallback, type MetaAdsProvider } from "../src/sources/providers.ts";

const serpFixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "real-serpapi.json"), "utf8")) as unknown[];

/** In-memory stand-in for the ledger queries the chain makes. */
function fakeDb(initialUsage: Record<string, number> = {}) {
  const usage = { ...initialUsage };
  const inserts: unknown[][] = [];
  const db: Queryable = {
    async query<T>(text: string, params: unknown[] = []) {
      if (text.startsWith("select coalesce(sum(units)")) return [{ units: usage[params[0] as string] ?? 0 }] as T[];
      if (text.startsWith("insert into public.cost_ledger")) {
        inserts.push(params);
        usage[params[0] as string] = (usage[params[0] as string] ?? 0) + Number(params[2]);
        return [] as T[];
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  return { db, inserts, usage };
}

const provider = (id: string, impl: MetaAdsProvider["fetchAds"], units = 100): MetaAdsProvider => ({
  id,
  label: id,
  envKey: `${id.toUpperCase()}_KEY`,
  free: { units, period: "lifetime" },
  fetchAds: impl,
});

describe("free-tier fallback chain", () => {
  it("uses the first configured provider and logs usage at $0", async () => {
    const { db, inserts } = fakeDb();
    const a = provider("a", async () => ({ items: serpFixture, units: 1 }));
    const r = await fetchWithFallback(db, { pageId: "1", limit: 30 }, { env: { A_KEY: "k" }, providers: [a] });
    expect(r.provider).toBe("a");
    expect(r.ads.length).toBe(2);
    expect(r.ads[0]!.brand?.name).toBe("HOKA");
    expect(inserts[0]).toEqual(["a", "page-ads", 1, 0, null, expect.stringContaining('"free_tier":true')]);
  });

  it("skips unconfigured providers, used-up allowances and quota errors", async () => {
    const { db } = fakeDb({ b: 98 });
    const calls: string[] = [];
    const a = provider("a", async () => {
      calls.push("a");
      return { items: [], units: 1 };
    });
    const b = provider("b", async () => {
      calls.push("b");
      return { items: serpFixture, units: 1 };
    });
    const c = provider("c", async () => {
      calls.push("c");
      throw new HttpError(429, "out of searches");
    });
    const d = provider("d", async () => {
      calls.push("d");
      return { items: serpFixture, units: 1 };
    });
    const r = await fetchWithFallback(db, { q: "running shoes", limit: 30 }, { env: { B_KEY: "k", C_KEY: "k", D_KEY: "k" }, providers: [provider("none", async () => ({ items: [], units: 0 })), a, b, c, d] });
    expect(calls).toEqual(["c", "d"]); // a not configured; b skipped: 98 + 3 > 100; c quota error
    expect(r.provider).toBe("d");
    expect(r.tried.map((t) => t.outcome)).toEqual(["not configured", "not configured", "free allowance used (98/100)", "HTTP 429", "ok (2 ads, 1 units)"]);
  });

  it("treats an empty successful answer as final (no wasted credits)", async () => {
    const { db } = fakeDb();
    const calls: string[] = [];
    const a = provider("a", async () => {
      calls.push("a");
      return { items: [], units: 1 };
    });
    const b = provider("b", async () => {
      calls.push("b");
      return { items: serpFixture, units: 1 };
    });
    const r = await fetchWithFallback(db, { pageId: "1", limit: 30 }, { env: { A_KEY: "k", B_KEY: "k" }, providers: [a, b] });
    expect(calls).toEqual(["a"]);
    expect(r).toMatchObject({ ads: [], provider: "a" });
  });

  it("returns no provider when every source is exhausted", async () => {
    const { db } = fakeDb({ a: 100 });
    const r = await fetchWithFallback(db, { pageId: "1", limit: 30 }, { env: { A_KEY: "k" }, providers: [provider("a", async () => ({ items: serpFixture, units: 1 }))] });
    expect(r).toMatchObject({ ads: [], provider: null });
  });
});
