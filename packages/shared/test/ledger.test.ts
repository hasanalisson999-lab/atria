import { describe, expect, it } from "vitest";
import { ApprovalRequiredError, BudgetExceededError, CostLedger, MemoryLedgerStore } from "../src/cost/ledger.ts";

function setup(now = new Date("2026-11-12T12:00:00Z"), budget = 10) {
  let clock = now;
  const store = new MemoryLedgerStore(() => clock);
  const ledger = new CostLedger(store, { defaultMonthlyBudgetUsd: budget, approvalThresholdUsd: 5, now: () => clock });
  return { store, ledger, setClock: (d: Date) => (clock = d) };
}

describe("CostLedger", () => {
  it("records spend per provider", async () => {
    const { ledger } = setup();
    await ledger.record({ provider: "apify", operation: "x", units: 100, usd: 0.075 });
    await ledger.record({ provider: "apify", operation: "x", units: 100, usd: 0.075 });
    await ledger.record({ provider: "anthropic", operation: "y", units: 1, usd: 1 });
    expect((await ledger.status("apify")).spentUsd).toBeCloseTo(0.15);
    expect((await ledger.status("anthropic")).spentUsd).toBe(1);
  });

  it("hard-stops when the monthly budget would be exceeded", async () => {
    const { ledger } = setup();
    await ledger.record({ provider: "apify", operation: "x", units: 1, usd: 9.5 });
    await expect(ledger.guard("apify", "x", 0.4)).resolves.toBeTruthy();
    await expect(ledger.guard("apify", "x", 0.6)).rejects.toBeInstanceOf(BudgetExceededError);
    // Other providers are unaffected.
    await expect(ledger.guard("voyage", "x", 0.6)).resolves.toBeTruthy();
  });

  it("is exhausted exactly at the budget", async () => {
    const { ledger } = setup();
    await ledger.record({ provider: "apify", operation: "x", units: 1, usd: 10 });
    expect((await ledger.status("apify")).exhausted).toBe(true);
    await expect(ledger.guard("apify", "x", 0.000001)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("requires explicit approval above the per-action threshold", async () => {
    const { ledger } = setup(undefined, 100);
    await expect(ledger.guard("apify", "big", 5.01)).rejects.toBeInstanceOf(ApprovalRequiredError);
    await expect(ledger.guard("apify", "big", 5.01, { approved: true })).resolves.toBeTruthy();
    await expect(ledger.guard("apify", "small", 5)).resolves.toBeTruthy();
  });

  it("approval never bypasses the budget", async () => {
    const { ledger } = setup(undefined, 6);
    await expect(ledger.guard("apify", "big", 7, { approved: true })).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("resets at the start of a new UTC month", async () => {
    const { ledger, setClock } = setup(new Date("2026-10-31T23:00:00Z"));
    await ledger.record({ provider: "apify", operation: "x", units: 1, usd: 10 });
    expect((await ledger.status("apify")).exhausted).toBe(true);
    setClock(new Date("2026-11-01T00:00:01Z"));
    expect((await ledger.status("apify")).spentUsd).toBe(0);
  });

  it("uses per-provider budget overrides", async () => {
    const { ledger, store } = setup();
    store.overrides.set("anthropic", 2);
    expect(await ledger.budgetFor("anthropic")).toBe(2);
    expect(await ledger.budgetFor("apify")).toBe(10);
  });

  it("track() guards, runs, and records the actual cost (not the estimate)", async () => {
    const { ledger, store } = setup();
    const out = await ledger.track("apify", "run", 0.2, async () => ({ result: "ok", units: 150, usd: 0.1125 }), { jobId: "job-1" });
    expect(out).toBe("ok");
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]).toMatchObject({ provider: "apify", operation: "run", units: 150, usd: 0.1125, jobId: "job-1" });
  });

  it("track() does not run the call when blocked", async () => {
    const { ledger } = setup(undefined, 0);
    let called = false;
    await expect(
      ledger.track("apify", "run", 0.01, async () => {
        called = true;
        return { result: 1, units: 1, usd: 0.01 };
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(called).toBe(false);
  });

  it("rejects invalid amounts", async () => {
    const { ledger } = setup();
    await expect(ledger.record({ provider: "apify", operation: "x", units: 1, usd: -1 })).rejects.toThrow();
    await expect(ledger.record({ provider: "apify", operation: "x", units: 1, usd: Number.NaN })).rejects.toThrow();
  });
});
