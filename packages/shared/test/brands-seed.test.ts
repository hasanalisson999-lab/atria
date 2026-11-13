import { describe, expect, it } from "vitest";
import { SEED_BRANDS, normName, pickBrandPage } from "../src/discovery/brands-seed.ts";

const hoka = SEED_BRANDS.find((b) => b.name === "HOKA")!;
const on = SEED_BRANDS.find((b) => b.name === "On")!;

describe("brand page resolution", () => {
  it("normalizes names", () => {
    expect(normName("HOKA ONE ONE")).toBe("hokaoneone");
    expect(normName("inov-8")).toBe("inov8");
    expect(normName("Alo Yoga®")).toBe("aloyoga");
  });

  it("picks the exact-name page with the biggest audience", () => {
    const page = pickBrandPage(hoka, [
      { pageId: "1", name: "Hoka Shoes Outlet Deals", likes: 900, ads: 30 },
      { pageId: "2", name: "HOKA", likes: 2_400_000, ads: 4 },
      { pageId: "3", name: "Hoka", likes: 1_200, ads: 9 },
    ]);
    expect(page?.pageId).toBe("2");
  });

  it("accepts aliases", () => {
    expect(pickBrandPage(on, [{ pageId: "9", name: "On Running", likes: null, ads: 2 }])?.pageId).toBe("9");
  });

  it("never guesses: resellers and look-alikes are rejected", () => {
    expect(pickBrandPage(hoka, [{ pageId: "1", name: "Hoka Shoes Outlet Deals", likes: 90_000, ads: 30 }])).toBeNull();
    expect(pickBrandPage(on, [{ pageId: "1", name: "Running Shoes Online", likes: 10, ads: 1 }])).toBeNull();
  });

  it("seed list has footwear first and no duplicate names", () => {
    expect(SEED_BRANDS[0]!.niche).toBe("footwear");
    const names = SEED_BRANDS.map((b) => normName(b.name));
    expect(new Set(names).size).toBe(names.length);
    expect(SEED_BRANDS.filter((b) => b.niche === "footwear").length).toBeGreaterThanOrEqual(20);
  });
});

import { facebookHandleFromHtml } from "../src/discovery/brands-seed.ts";
describe("facebook handle from homepage", () => {
  it("finds the most-linked page, ignoring share/tracking links", () => {
    const html = `<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
      <img src="https://www.facebook.com/tr?id=123&ev=PageView">
      <a href="https://www.facebook.com/Gymshark">fb</a><a href="https://facebook.com/gymshark/">fb</a>`;
    expect(facebookHandleFromHtml(html)).toBe("gymshark");
  });
  it("returns null when there is no link", () => {
    expect(facebookHandleFromHtml("<html>no socials</html>")).toBeNull();
  });
});
