import type { CostLedger } from "../../cost/ledger.ts";
import type { AdSource, BrandQuery, KeywordQuery, NormalizedAd, SourceResult } from "../../types.ts";
import { normalizeAdLibraryItem } from "../normalize/adLibrary.ts";
import { APIFY_ACTORS, estimateApifyUsd, listPriceUsd, type ApifyActorSpec } from "./actors.ts";
import { ApifyClient } from "./client.ts";

/**
 * AdSource backed by an Apify Meta Ad Library scraper. Every run is guarded by the cost ledger
 * and capped server-side with maxTotalChargeUsd, so a runaway run can't exceed its estimate.
 */
export class ApifyMetaScraper implements AdSource {
  readonly id: string;
  private readonly spec: ApifyActorSpec;

  constructor(
    private readonly client: ApifyClient,
    actorId: string,
    private readonly ledger: CostLedger,
    private readonly opts: { jobId?: string | null; approved?: boolean } = {},
  ) {
    const spec = APIFY_ACTORS[actorId];
    if (!spec) throw new Error(`Unknown Apify actor "${actorId}". Known: ${Object.keys(APIFY_ACTORS).join(", ")}`);
    this.spec = spec;
    this.id = `apify:${actorId}`;
  }

  normalize(raw: unknown, country?: string): NormalizedAd | null {
    return normalizeAdLibraryItem(raw, { source: "meta_ad_library", country });
  }

  searchByKeyword(q: KeywordQuery): Promise<SourceResult> {
    return this.run("keyword-search", this.spec.keywordInput(q), q.limit, q.country, { term: q.term, country: q.country });
  }

  getByBrand(q: BrandQuery): Promise<SourceResult> {
    return this.run("page-ads", this.spec.pageInput(q), q.limit, q.country, { pageId: q.pageId });
  }

  private async run(operation: string, input: Record<string, unknown>, limit: number, country: string | undefined, meta: Record<string, unknown>): Promise<SourceResult> {
    const estimate = estimateApifyUsd(this.spec, limit);
    const cap = Math.max(0.01, Math.round(estimate * 1.25 * 100) / 100);
    return this.ledger.track(
      "apify",
      `${this.spec.id}:${operation}`,
      estimate,
      async () => {
        const started = await this.client.startRun(this.spec.id, input, { maxTotalChargeUsd: cap });
        const run = await this.client.waitForFinish(started.id);
        const items = run.defaultDatasetId ? await this.client.getAllItems(run.defaultDatasetId) : [];
        // Apify's per-run figures can under-report pay-per-event charges, so never record less than list price.
        const usd = Math.max(this.client.runCostUsd(run), listPriceUsd(this.spec, items.length));
        if (run.status !== "SUCCEEDED" && items.length === 0) {
          // Still record what we were charged before surfacing the failure.
          await this.ledger.record({ provider: "apify", operation: `${this.spec.id}:${operation}:failed`, units: 0, usd, jobId: this.opts.jobId, meta: { ...meta, runId: run.id, status: run.status } });
          throw new Error(`Apify run ${run.id} ended ${run.status} with no items`);
        }
        const ads: NormalizedAd[] = [];
        let skipped = 0;
        const seen = new Set<string>();
        for (const item of items) {
          const ad = this.normalize(item, country);
          if (!ad || seen.has(ad.sourceAdId)) {
            skipped++;
            continue;
          }
          seen.add(ad.sourceAdId);
          ads.push(ad);
        }
        const result: SourceResult = { ads, skipped, usd, units: items.length, meta: { ...meta, runId: run.id, status: run.status } };
        return { result, units: items.length, usd, meta: { ...meta, runId: run.id, status: run.status, items: items.length } };
      },
      { approved: this.opts.approved, jobId: this.opts.jobId },
    );
  }
}
