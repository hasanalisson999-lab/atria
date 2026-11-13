import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAdLibraryItem } from "../src/sources/normalize/adLibrary.ts";
import { cleanUrl, normalizeFormat, toIsoDate } from "../src/sources/normalize/util.ts";

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"));
const ctx = { source: "meta_ad_library", country: "US" };

describe("normalizeAdLibraryItem — raw snake_case (curious_coder)", () => {
  const ad = normalizeAdLibraryItem(fixture("raw-snake.json"), ctx)!;

  it("maps identity and brand", () => {
    expect(ad.sourceAdId).toBe("1111111111111111");
    expect(ad.source).toBe("meta_ad_library");
    expect(ad.brand).toMatchObject({ platform: "meta", platformPageId: "222222222", name: "Test Activewear Co", category: "Clothing (Brand)" });
  });

  it("maps copy, CTA and unwraps the l.php redirect", () => {
    expect(ad.bodyText).toContain("Squat-proof shorts");
    expect(ad.headline).toBe("The Everyday Gym Short");
    expect(ad.cta).toBe("Shop now");
    expect(ad.landingUrl).toBe("https://www.testactivewear.com/products/shorts?utm_source=fb");
    expect(ad.landingDomain).toBe("testactivewear.com");
  });

  it("maps format, media, dates, platforms, variations", () => {
    expect(ad.format).toBe("video");
    expect(ad.media).toEqual([{ type: "video", url: "https://video.xx.fbcdn.net/v/hd.mp4?oh=1", previewUrl: "https://scontent.xx.fbcdn.net/v/preview.jpg?oh=1" }]);
    expect(ad.startDate).toBe("2025-10-11");
    expect(ad.endDate).toBeNull();
    expect(ad.isActive).toBe(true);
    expect(ad.platforms).toEqual(["facebook", "instagram", "audience_network"]);
    expect(ad.variationsCount).toBe(4);
    expect(ad.creativeHash).toBe("col:333333333");
  });

  it("falls back to the query country when the item has none", () => {
    expect(ad.countries).toEqual(["US"]);
  });
});

describe("normalizeAdLibraryItem — raw camelCase DCO (apify official)", () => {
  const ad = normalizeAdLibraryItem(fixture("raw-camel.json"), ctx)!;

  it("replaces {{product.*}} template copy with the first card", () => {
    expect(ad.format).toBe("dco");
    expect(ad.bodyText).toBe("Clean pre-workout. No crash.");
    expect(ad.headline).toBe("Pump Formula");
    expect(ad.description).toBe("Now 20% off");
  });

  it("collects card images, item countries, inactive state, text hash", () => {
    expect(ad.media.map((m) => m.url)).toEqual(["https://scontent.xx.fbcdn.net/v/card1.jpg?a=1", "https://scontent.xx.fbcdn.net/v/card2.jpg?a=1"]);
    expect(ad.countries).toEqual(["DE", "FR"]);
    expect(ad.isActive).toBe(false);
    expect(ad.startDate).toBe("2025-09-16");
    expect(ad.endDate).toBe("2025-10-31");
    expect(ad.creativeHash).toMatch(/^txt:[0-9a-f]{40}$/);
    expect(ad.brand?.platformPageId).toBe("555555555");
  });
});

describe("normalizeAdLibraryItem — automly clean", () => {
  const ad = normalizeAdLibraryItem(fixture("automly-clean.json"), ctx)!;

  it("maps the flat shape", () => {
    expect(ad.sourceAdId).toBe("7777777777777777");
    expect(ad.format).toBe("carousel");
    expect(ad.variationsCount).toBe(3);
    expect(ad.platforms).toEqual(["facebook", "instagram"]);
    expect(ad.landingDomain).toBe("example-gymwear.com");
    expect(ad.startDate).toBe("2026-08-25");
    expect(ad.brand).toMatchObject({ platformPageId: "888888888", name: "Example Gymwear" });
  });

  it("dedupes signed URLs that differ only by query string", () => {
    expect(ad.media.map((m) => m.url)).toEqual([
      "https://scontent.xx.fbcdn.net/v/a.jpg?x=1",
      "https://scontent.xx.fbcdn.net/v/b.jpg",
      "https://scontent.xx.fbcdn.net/v/c.jpg",
    ]);
  });
});

describe("normalizer guards and helpers", () => {
  it("rejects items without a numeric ad id", () => {
    expect(normalizeAdLibraryItem({ snapshot: {} }, ctx)).toBeNull();
    expect(normalizeAdLibraryItem({ ad_archive_id: "abc", snapshot: {} }, ctx)).toBeNull();
    expect(normalizeAdLibraryItem(null, ctx)).toBeNull();
    expect(normalizeAdLibraryItem("x", ctx)).toBeNull();
  });

  it("same text => same hash; different brand => different hash", () => {
    const base = fixture("raw-camel.json");
    const a = normalizeAdLibraryItem(base, ctx)!;
    const b = normalizeAdLibraryItem({ ...base, adArchiveID: "4444444444444445" }, ctx)!;
    const c = normalizeAdLibraryItem({ ...base, adArchiveID: "4444444444444446", pageID: "999" }, ctx)!;
    expect(a.creativeHash).toBe(b.creativeHash);
    expect(a.creativeHash).not.toBe(c.creativeHash);
  });

  it("parses dates in every format we see", () => {
    expect(toIsoDate(1760140800)).toBe("2025-10-11");
    expect(toIsoDate("1760140800")).toBe("2025-10-11");
    expect(toIsoDate(1760140800000)).toBe("2025-10-11");
    expect(toIsoDate("2026-03-16T07:00:00.000Z")).toBe("2026-03-16");
    expect(toIsoDate("2026-03-16")).toBe("2026-03-16");
    expect(toIsoDate(0)).toBeNull();
    expect(toIsoDate("garbage")).toBeNull();
  });

  it("rejects non-http URLs", () => {
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("not a url")).toBeNull();
  });

  it("infers format from media when display_format is missing", () => {
    expect(normalizeFormat(undefined, { videos: 1, images: 0, cards: 0 })).toBe("video");
    expect(normalizeFormat(undefined, { videos: 0, images: 2, cards: 3 })).toBe("carousel");
    expect(normalizeFormat("MULTI_IMAGES", { videos: 0, images: 2, cards: 0 })).toBe("carousel");
    expect(normalizeFormat("DPA", { videos: 0, images: 0, cards: 0 })).toBe("dco");
    expect(normalizeFormat(null, { videos: 0, images: 0, cards: 0 })).toBe("unknown");
  });
});
