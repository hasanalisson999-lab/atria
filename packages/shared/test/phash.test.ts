import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { dHash, groupByHash, hamming } from "../src/media/phash.ts";

const gradient = (w: number, h: number, flip = false) =>
  sharp(Buffer.from(Array.from({ length: w * h * 3 }, (_, i) => { const x = Math.floor(i / 3) % w; return Math.round(((flip ? w - x : x) / w) * 255); })), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();

describe("perceptual hash", () => {
  it("same picture at different sizes / encodings → same hash", async () => {
    const big = await gradient(400, 300);
    const small = await sharp(big).resize(120, 90).jpeg({ quality: 60 }).toBuffer();
    expect(hamming(await dHash(big), await dHash(small))).toBeLessThanOrEqual(2);
  });
  it("different pictures → far apart", async () => {
    expect(hamming(await dHash(await gradient(200, 200)), await dHash(await gradient(200, 200, true)))).toBeGreaterThan(30);
  });
  it("groups near-identical creatives per brand only", () => {
    const g = groupByHash([
      { id: "a", group: "nike", hash: "ffff0000ffff0000" },
      { id: "b", group: "nike", hash: "ffff0000ffff0001" },
      { id: "c", group: "nike", hash: "0000ffff0000ffff" },
      { id: "d", group: "hoka", hash: "ffff0000ffff0000" },
      { id: "e", group: "nike", hash: null },
    ]);
    expect(g.get("a")).toBe("a");
    expect(g.get("b")).toBe("a");
    expect(g.get("c")).toBe("c");
    expect(g.get("d")).toBe("d");
    expect(g.get("e")).toBe("e");
  });
});

describe("copy-based grouping", () => {
  it("merges same-brand ads with identical copy even when thumbnails differ", async () => {
    const { copyKey, groupByHash } = await import("../src/media/phash.ts");
    const body = "Meet the Wave Rider 29: smoother, lighter, faster on every run.";
    const g = groupByHash([
      { id: "a", group: "mizuno", hash: "0000000000000000", textKey: copyKey(body, "Wave Rider 29", "video") },
      { id: "b", group: "mizuno", hash: "ffffffffffffffff", textKey: copyKey(body + " ", "Wave Rider 29!", "video") },
      { id: "c", group: "hoka", hash: "ffffffffffffffff", textKey: copyKey(body, "Wave Rider 29", "video") },
      { id: "d", group: "mizuno", hash: "0f0f0f0f0f0f0f0f", textKey: copyKey("Short", null, "image") },
    ]);
    expect(g.get("b")).toBe(g.get("a"));
    expect(g.get("c")).not.toBe(g.get("a"));
    expect(g.get("d")).toBe("d");
  });
});
