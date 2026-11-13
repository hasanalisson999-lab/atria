import { describe, expect, it } from "vitest";
import { EnvError, envStatus, guardrails, requireEnv } from "../src/env.ts";
import { HttpError, backoffDelay, parseRetryAfter, withRetry } from "../src/retry.ts";

const noSleep = { sleep: async () => {}, random: () => 0.5 };

describe("withRetry", () => {
  it("retries retryable errors then succeeds", async () => {
    let n = 0;
    const delays: number[] = [];
    const out = await withRetry(
      async () => {
        if (++n < 3) throw new HttpError(429, "slow down");
        return "done";
      },
      { ...noSleep, onRetry: (i) => delays.push(i.delayMs) },
    );
    expect(out).toBe("done");
    expect(n).toBe(3);
    expect(delays).toHaveLength(2);
  });

  it("does not retry client errors", async () => {
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw new HttpError(400, "bad");
      }, noSleep),
    ).rejects.toThrow("bad");
    expect(n).toBe(1);
  });

  it("gives up after `retries`", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new HttpError(503, "down");
        },
        { ...noSleep, retries: 2 },
      ),
    ).rejects.toThrow("down");
    expect(n).toBe(3);
  });

  it("honors Retry-After (capped at maxMs)", async () => {
    const delays: number[] = [];
    let n = 0;
    await withRetry(
      async () => {
        if (++n === 1) throw new HttpError(429, "x", 120_000);
        return 1;
      },
      { ...noSleep, maxMs: 10_000, onRetry: (i) => delays.push(i.delayMs) },
    );
    expect(delays).toEqual([10_000]);
  });

  it("full-jitter backoff grows exponentially and is capped", () => {
    expect(backoffDelay(0, 500, 30_000, () => 1)).toBe(500);
    expect(backoffDelay(3, 500, 30_000, () => 1)).toBe(4000);
    expect(backoffDelay(10, 500, 30_000, () => 1)).toBe(30_000);
    expect(backoffDelay(3, 500, 30_000, () => 0)).toBe(0);
  });

  it("parses Retry-After seconds", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe("env", () => {
  const good = {
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    DATABASE_URL: "postgresql://u:xyzzypw@host:5432/postgres",
    APIFY_TOKEN: "apify_api_xyzzyVALUE",
  };

  it("reports configured / missing / invalid without exposing values", () => {
    const st = envStatus({ ...good, DATABASE_URL: "postgresql://u:[YOUR-PASSWORD]@h/db" });
    const db = st.find((s) => s.key === "DATABASE_URL")!;
    expect(db.state).toBe("invalid");
    expect(db.reason).toBe("contains a placeholder");
    expect(st.find((s) => s.key === "APIFY_TOKEN")!.state).toBe("configured");
    expect(st.find((s) => s.key === "ANTHROPIC_API_KEY")!.state).toBe("missing");
    expect(JSON.stringify(st)).not.toContain("xyzzy");
  });

  it("requireEnv returns values or throws listing only key names", () => {
    expect(requireEnv(["APIFY_TOKEN"], good).APIFY_TOKEN).toBe("apify_api_xyzzyVALUE");
    try {
      requireEnv(["APIFY_TOKEN", "R2_BUCKET", "DATABASE_URL"], { ...good, DATABASE_URL: "postgres://x:[YOUR-PASSWORD]@h/d" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const msg = (e as Error).message;
      expect(msg).toContain("R2_BUCKET: missing");
      expect(msg).toContain("DATABASE_URL: contains a placeholder");
      expect(msg).not.toContain("xyzzy");
    }
  });

  it("guardrails default and coerce", () => {
    expect(guardrails({})).toEqual({ MONTHLY_BUDGET_USD: 50, WINNER_MIN_DAYS: 30, APPROVAL_THRESHOLD_USD: 5 });
    expect(guardrails({ MONTHLY_BUDGET_USD: "20", WINNER_MIN_DAYS: "21" }).WINNER_MIN_DAYS).toBe(21);
  });
});
