import { describe, expect, it } from "vitest";
import { normalizeAdLibraryItem } from "../src/sources/normalize/adLibrary.ts";
import { fromSocialCrawl } from "../src/sources/providers.ts";

describe("fromSocialCrawl", () => {
  const post = {
    id: "1541926426938452",
    content: { text: "Find your pace.", media_urls: ["https://x/1.jpg", "https://x/2.jpg"], thumbnail_url: "https://x/1.jpg" },
    author: { display_name: "HOKA", avatar_url: "https://x/logo.jpg" },
    published_at: "2025-10-30T07:00:00.000Z",
    ext: { ad: { page_id: "702421736592975", is_active: true, cta_text: "Shop now", link_url: "https://www.hoka.com/x", display_format: "DPA", publisher_platforms: ["FACEBOOK", "INSTAGRAM"], page_like_count: 1227250 } },
  };

  it("maps an image ad back to a normalizable Meta shape", () => {
    const ad = normalizeAdLibraryItem(fromSocialCrawl(post), { source: "meta_ad_library" })!;
    expect(ad.sourceAdId).toBe("1541926426938452");
    expect(ad.brand?.name).toBe("HOKA");
    expect(ad.startDate).toBe("2025-10-30");
    expect(ad.bodyText).toBe("Find your pace.");
    expect(ad.media.length).toBeGreaterThanOrEqual(2);
  });

  it("maps a video ad and tolerates a non-array media field", () => {
    const v = { ...post, content: { ...post.content, media_urls: "https://x/only.jpg" as unknown as string[] }, ext: { ad: { ...post.ext.ad, video_hd_url: "https://x/v.mp4", display_format: "VIDEO" } } };
    const ad = normalizeAdLibraryItem(fromSocialCrawl(v), { source: "meta_ad_library" })!;
    expect(ad.format).toBe("video");
    expect(ad.media.some((m) => m.type === "video")).toBe(true);
  });
});
