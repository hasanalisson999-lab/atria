import { describe, expect, it } from "vitest";
import { adBreakdownSchema } from "../src/ai/gemini.ts";
import { extractJson, scoreModel } from "../src/ai/llm.ts";

describe("scoreModel", () => {
  it("ranks big flagship models above tiny ones", () => {
    expect(scoreModel("nvidia/nemotron-3-ultra-550b-a55b:free")).toBeGreaterThan(scoreModel("liquid/lfm-3-1.7b:free"));
    expect(scoreModel("openai/gpt-oss-120b")).toBeGreaterThan(scoreModel("openai/gpt-oss-20b"));
    expect(scoreModel("google/gemma-4-31b-it:free")).toBeGreaterThan(scoreModel("google/gemma-4-26b-a4b-it:free") - 10);
  });

  it("prefers newer models when otherwise equal", () => {
    const old = scoreModel("vendor/model-70b", { created: Date.UTC(2025, 1, 1) / 1000 });
    const fresh = scoreModel("vendor/model-70b", { created: Date.UTC(2026, 9, 1) / 1000 });
    expect(fresh).toBeGreaterThan(old);
  });
});

describe("extractJson", () => {
  it("reads fenced and chatty replies", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```\nhope this helps')).toEqual({ a: 1 });
    expect(extractJson('Here: {"a":{"b":[1,2]}} done')).toEqual({ a: { b: [1, 2] } });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("adBreakdownSchema", () => {
  it("trims long model output to the short format", () => {
    const b = adBreakdownSchema.parse({
      hook_text: "Your knees will thank you",
      angle: "Cushioning that protects joints",
      format_tags: ["UGC", "athlete", "demo", "lifestyle", "extra"],
      emotions: ["relief", "pride", "confidence", "joy"],
      script_breakdown: Array.from({ length: 8 }, (_, i) => ({ start_s: i, end_s: i + 1, visual: `beat ${i}`, voiceover: null })),
      why_it_works: "Names the pain first. Shows proof fast. Ends on a clear offer. Extra sentence.",
      takeaway: null,
    });
    expect(b.format_tags).toHaveLength(4);
    expect(b.emotions).toHaveLength(3);
    expect(b.script_breakdown).toHaveLength(5);
    expect(b.script_breakdown[0]!.voiceover).toBe("");
    expect(b.why_it_works).toEqual(["Names the pain first.", "Shows proof fast.", "Ends on a clear offer."]);
    expect(b.takeaway).toBe("");
    expect(b.hook_type).toBe("other");
  });

  it("accepts bullet arrays with markers", () => {
    const b = adBreakdownSchema.parse({ hook_text: "x", angle: "y", why_it_works: ["- one", "• two", "3) three"] });
    expect(b.why_it_works).toEqual(["one", "two", "three"]);
  });
});
