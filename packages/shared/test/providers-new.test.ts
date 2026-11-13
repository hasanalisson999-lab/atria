import { describe, expect, it } from "vitest";
import { adspoId, fromAdspo } from "../src/sources/adspo.ts";
import { fromBrightData } from "../src/sources/brightdata.ts";
import { normalizeAdLibraryItem } from "../src/sources/normalize/adLibrary.ts";
import { fromParse } from "../src/sources/parsebot.ts";
import { fromSocialFetch } from "../src/sources/socialfetch.ts";

const norm = (raw: Record<string, unknown> | null) => normalizeAdLibraryItem(raw, { source: "meta_ad_library" });

describe("Social Fetch adapter", () => {
  it("maps a video ad with page and CTA", () => {
    const ad = norm(
      fromSocialFetch({
        id: "1541926426938452",
        page: { id: "702421736592975", name: "HOKA", likeCount: 1200000 },
        isActive: true,
        startedAt: "2025-10-30",
        creative: { bodyText: "Fly", callToAction: "Shop now", linkUrl: "https://www.hoka.com/x", videos: [{ hdUrl: "https://v/hd.mp4", previewImageUrl: "https://v/p.jpg" }] },
      }),
    )!;
    expect(ad.sourceAdId).toBe("1541926426938452");
    expect(ad.brand?.name).toBe("HOKA");
    expect(ad.cta).toBe("Shop now");
    expect(ad.landingDomain).toBe("hoka.com");
    expect(ad.media[0]?.type).toBe("video");
  });
});

describe("Parse adapter", () => {
  it("converts unix-second dates and string media", () => {
    const ad = norm(fromParse({ ad_archive_id: "123456789012345", page_id: "1", page_name: "Nike", start_date: 1773730800, images: ["https://i/a.jpg"], videos: [], is_active: true }))!;
    expect(ad.startDate).toBe("2026-03-17");
    expect(ad.media).toHaveLength(1);
    expect(ad.brand?.name).toBe("Nike");
  });
});

describe("Adspo adapter", () => {
  it("derives a stable numeric id that can't collide with archive ids", () => {
    const id = adspoId("0a5d0f0c4b526bdfbd4b81bdeab8af78");
    expect(id).toMatch(/^7\d{17}$/);
    expect(adspoId("0a5d0f0c4b526bdfbd4b81bdeab8af78")).toBe(id);
  });
  it("maps an image creative", () => {
    const ad = norm(fromAdspo({ creative_id: "bd764f3eda58269f55d23d1fed40b5b5", brand_id: "103032366405927", brand_name: "HOKA", format: "IMAGE", hd_url: "https://r2/x.jpg", is_active: false, start_date: "2026-11-05T08:00:00Z", end_date: "2026-11-10T08:00:00Z", landing_pages: ["https://www.hoka.com/a"] }))!;
    expect(ad.format).toBe("image");
    expect(ad.isActive).toBe(false);
    expect(ad.landingDomain).toBe("hoka.com");
  });
});

describe("Bright Data adapter", () => {
  it("maps a keyword-discovery record", () => {
    const ad = norm(fromBrightData({ library_id: "2097042437599097", advertiser_name: "DICK'S", is_active: true, image_url: "https://i/x.jpg", cta_text: "Shop Now", link_url: "https://www.dickssportinggoods.com/f" }))!;
    expect(ad.sourceAdId).toBe("2097042437599097");
    expect(ad.media).toHaveLength(1);
    expect(ad.cta).toBe("Shop Now");
  });
  it("skips records without an id", () => {
    expect(fromBrightData({ advertiser_name: "x" })).toBeNull();
  });
});
