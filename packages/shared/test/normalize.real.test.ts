import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAdLibraryItem } from "../src/sources/normalize/adLibrary.ts";

/** Real scraper output saved by `npm run benchmark`. Skipped until the benchmark has run. */
const dir = join(import.meta.dirname, "fixtures");
const files = readdirSync(dir).filter((f) => f.startsWith("real-") && f.endsWith(".json"));

describe.skipIf(files.length === 0)("normalizer on real scraper output", () => {
  for (const file of files) {
    it(`normalizes ${file}`, () => {
      const items = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown[];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const ad = normalizeAdLibraryItem(item, { source: "meta_ad_library", country: "US" });
        expect(ad, "item should normalize").not.toBeNull();
        expect(ad!.sourceAdId).toMatch(/^\d+$/);
        expect(ad!.brand?.platformPageId).toMatch(/^\d+$/);
        expect(ad!.creativeHash).toMatch(/^(col|txt):/);
        expect(ad!.startDate === null || /^\d{4}-\d{2}-\d{2}$/.test(ad!.startDate)).toBe(true);
      }
    });
  }
});
