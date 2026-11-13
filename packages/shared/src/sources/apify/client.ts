import { fetchJson, withRetry, type RetryOptions } from "../../retry.ts";

const API = "https://api.apify.com/v2";

export interface ApifyRun {
  id: string;
  actId: string;
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMING-OUT" | "TIMED-OUT" | "ABORTING" | "ABORTED";
  startedAt: string;
  finishedAt: string | null;
  defaultDatasetId: string;
  usageTotalUsd?: number;
  chargedEventCounts?: Record<string, number>;
  pricingInfo?: {
    pricingModel?: string;
    isPPEPlatformUsagePaidByUser?: boolean;
    pricingPerEvent?: { actorChargeEvents?: Record<string, { eventPriceUsd?: number; eventTieredPricingUsd?: Record<string, { tieredEventPriceUsd: number }> }> };
    pricePerUnitUsd?: number;
  };
  stats?: { durationMillis?: number; runTimeSecs?: number };
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);

export class ApifyClient {
  constructor(
    private readonly token: string,
    private readonly retry: RetryOptions = {},
    /** Apify pricing tier of the account (FREE, BRONZE, ...); used to price tiered events. */
    private readonly tier: string = "FREE",
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  async startRun(actorId: string, input: unknown, opts: { maxTotalChargeUsd?: number; memoryMbytes?: number; timeoutSecs?: number } = {}): Promise<ApifyRun> {
    const qs = new URLSearchParams();
    if (opts.maxTotalChargeUsd != null) qs.set("maxTotalChargeUsd", String(opts.maxTotalChargeUsd));
    if (opts.memoryMbytes) qs.set("memory", String(opts.memoryMbytes));
    if (opts.timeoutSecs) qs.set("timeout", String(opts.timeoutSecs));
    const res = await withRetry(
      () =>
        fetchJson<{ data: ApifyRun }>(`${API}/acts/${encodeURIComponent(actorId.replace("/", "~"))}/runs?${qs}`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(input),
        }),
      this.retry,
    );
    return res.data;
  }

  async getRun(runId: string, waitSecs = 60): Promise<ApifyRun> {
    const res = await withRetry(
      () => fetchJson<{ data: ApifyRun }>(`${API}/actor-runs/${runId}?waitForFinish=${waitSecs}`, { headers: this.headers(), timeoutMs: (waitSecs + 30) * 1000 }),
      this.retry,
    );
    return res.data;
  }

  async waitForFinish(runId: string, maxWaitMs = 30 * 60_000): Promise<ApifyRun> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const run = await this.getRun(runId, 60);
      if (TERMINAL.has(run.status)) return run;
      if (Date.now() > deadline) throw new Error(`Apify run ${runId} still ${run.status} after ${Math.round(maxWaitMs / 1000)}s`);
    }
  }

  async abortRun(runId: string): Promise<void> {
    await fetchJson(`${API}/actor-runs/${runId}/abort`, { method: "POST", headers: this.headers() }).catch(() => undefined);
  }

  async *iterateItems<T = unknown>(datasetId: string, pageSize = 500): AsyncGenerator<T[]> {
    for (let offset = 0; ; offset += pageSize) {
      const items = await withRetry(
        () => fetchJson<T[]>(`${API}/datasets/${datasetId}/items?clean=true&format=json&offset=${offset}&limit=${pageSize}`, { headers: this.headers() }),
        this.retry,
      );
      if (!items.length) return;
      yield items;
      if (items.length < pageSize) return;
    }
  }

  async getAllItems<T = unknown>(datasetId: string): Promise<T[]> {
    const out: T[] = [];
    for await (const page of this.iterateItems<T>(datasetId)) out.push(...page);
    return out;
  }

  /** Actual USD charged for a finished run (pay-per-event charges + platform usage when billed to the user). */
  runCostUsd(run: ApifyRun): number {
    const pi = run.pricingInfo;
    const events = pi?.pricingPerEvent?.actorChargeEvents;
    if (pi?.pricingModel === "PAY_PER_EVENT" && events) {
      let usd = 0;
      for (const [name, count] of Object.entries(run.chargedEventCounts ?? {})) {
        const ev = events[name];
        if (!ev) continue;
        const price = ev.eventTieredPricingUsd?.[this.tier]?.tieredEventPriceUsd ?? ev.eventPriceUsd ?? 0;
        usd += price * count;
      }
      if (pi.isPPEPlatformUsagePaidByUser) usd += run.usageTotalUsd ?? 0;
      return round6(usd);
    }
    return round6(run.usageTotalUsd ?? 0);
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
