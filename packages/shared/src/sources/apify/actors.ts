import type { BrandQuery, KeywordQuery } from "../../types.ts";

/** Meta Ad Library web URLs — the public, logged-out library every scraper reads. */
export function adLibraryKeywordUrl(q: KeywordQuery): string {
  const p = new URLSearchParams({
    active_status: q.activeOnly === false ? "all" : "active",
    ad_type: "all",
    country: q.country,
    is_targeted_country: "false",
    media_type: "all",
    q: q.term,
    search_type: "keyword_unordered",
  });
  return `https://www.facebook.com/ads/library/?${p}`;
}

export function adLibraryPageUrl(q: BrandQuery): string {
  const p = new URLSearchParams({
    active_status: q.activeOnly === false ? "all" : "active",
    ad_type: "all",
    country: q.country ?? "ALL",
    is_targeted_country: "false",
    media_type: "all",
    search_type: "page",
    view_all_page_id: q.pageId,
  });
  // Highest-impression ads first: the page's strongest performers.
  p.set("sort_data[mode]", "total_impressions");
  p.set("sort_data[direction]", "desc");
  return `https://www.facebook.com/ads/library/?${p}`;
}

export interface ApifyActorSpec {
  id: string;
  label: string;
  /** Price per returned ad on the account's tier, plus per-run start fee. Used for pre-flight estimates only. */
  pricePerAdUsd: number;
  startFeeUsd: number;
  keywordInput(q: KeywordQuery): Record<string, unknown>;
  pageInput(q: BrandQuery): Record<string, unknown>;
}

export const APIFY_ACTORS: Record<string, ApifyActorSpec> = {
  "curious_coder/facebook-ads-library-scraper": {
    id: "curious_coder/facebook-ads-library-scraper",
    label: "curious_coder · Facebook Ad Library Scraper",
    pricePerAdUsd: 0.00075,
    startFeeUsd: 0.00005,
    keywordInput: (q) => ({
      urls: [{ url: adLibraryKeywordUrl(q) }],
      count: q.limit,
      limitPerSource: q.limit,
      scrapeAdDetails: false,
      "scrapePageAds.activeStatus": q.activeOnly === false ? "all" : "active",
      "scrapePageAds.countryCode": q.country,
    }),
    pageInput: (q) => ({
      urls: [{ url: adLibraryPageUrl(q) }],
      count: q.limit,
      limitPerSource: q.limit,
      scrapeAdDetails: false,
      "scrapePageAds.activeStatus": q.activeOnly === false ? "all" : "active",
      "scrapePageAds.countryCode": q.country ?? "ALL",
    }),
  },
  "apify/facebook-ads-scraper": {
    id: "apify/facebook-ads-scraper",
    label: "Apify · Facebook Ads Library Scraper (official)",
    pricePerAdUsd: 0.0058,
    startFeeUsd: 0,
    keywordInput: (q) => ({
      startUrls: [{ url: adLibraryKeywordUrl(q) }],
      resultsLimit: q.limit,
      activeStatus: q.activeOnly === false ? "" : "active",
      isDetailsPerAd: false,
      includeAboutPage: false,
      onlyTotal: false,
      enrichWithEcommerceData: false,
    }),
    pageInput: (q) => ({
      startUrls: [{ url: adLibraryPageUrl(q) }],
      resultsLimit: q.limit,
      activeStatus: q.activeOnly === false ? "" : "active",
      isDetailsPerAd: false,
      includeAboutPage: false,
      onlyTotal: false,
      enrichWithEcommerceData: false,
    }),
  },
  "automly/facebook-ad-library-scraper": {
    id: "automly/facebook-ad-library-scraper",
    label: "automly · Facebook Ads Scraper",
    pricePerAdUsd: 0.0007,
    startFeeUsd: 0.05,
    keywordInput: (q) => ({
      searchTerms: [q.term],
      country: q.country,
      activeStatus: q.activeOnly === false ? "all" : "active",
      adType: "all",
      mediaType: "all",
      searchType: "keyword_unordered",
      maxAds: q.limit,
      outputFormat: "clean",
    }),
    pageInput: (q) => ({
      urls: [{ url: adLibraryPageUrl(q) }],
      country: q.country ?? "ALL",
      activeStatus: q.activeOnly === false ? "all" : "active",
      maxAds: q.limit,
      outputFormat: "clean",
    }),
  },
};

export function estimateApifyUsd(spec: ApifyActorSpec, ads: number, runs = 1): number {
  return spec.pricePerAdUsd * ads + spec.startFeeUsd * runs;
}

/** What Apify bills for one finished run at list price: per-ad events plus the start fee. */
export function listPriceUsd(spec: ApifyActorSpec, items: number): number {
  return Math.round((spec.pricePerAdUsd * items + spec.startFeeUsd) * 1e6) / 1e6;
}
