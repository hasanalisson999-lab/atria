import { describe, expect, it } from "vitest";
import { normalizeTikTokAd, tiktokAdvertiserMatches } from "../src/sources/tiktok.ts";

describe("tiktok", () => {
  it("matches only the brand's own advertiser accounts", () => {
    expect(tiktokAdvertiserMatches("Skechers", "Skechers")).toBe(true);
    expect(tiktokAdvertiserMatches("HOKA EU", "HOKA")).toBe(true);
    expect(tiktokAdvertiserMatches("Skechers Official", "Skechers")).toBe(true);
    expect(tiktokAdvertiserMatches("SKECHERS S.À R.L.", "Skechers")).toBe(true);
    expect(tiktokAdvertiserMatches("Deckers Europe B.V.", "HOKA")).toBe(false);
    expect(tiktokAdvertiserMatches("crocsfan99", "Crocs")).toBe(false);
    expect(tiktokAdvertiserMatches("livvinwithjoy", "HOKA")).toBe(false);
  });
  it("normalizes a video ad", () => {
    const a = normalizeTikTokAd({ id: "1", name: "Skechers", title: "Skechers AERO", first_shown_date: Date.UTC(2026, 10, 1), last_shown_date: Date.now(), videos: [{ video_url: "https://v/1.mp4", cover_img: "https://c/1.jpg" }] })!;
    expect(a.format).toBe("video");
    expect(a.platforms).toEqual(["tiktok"]);
    expect(a.startDate).toBe("2026-11-01");
    expect(a.isActive).toBe(true);
    expect(a.media[0]).toEqual({ type: "video", url: "https://v/1.mp4", previewUrl: "https://c/1.jpg" });
  });
});
