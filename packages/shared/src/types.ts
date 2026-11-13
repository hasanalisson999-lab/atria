/** The one internal shape every data source normalizes into. */

export type AdFormat = "image" | "video" | "carousel" | "dco" | "unknown";
export type AdPlatform = "facebook" | "instagram" | "messenger" | "audience_network" | "threads" | "whatsapp" | "tiktok";

export interface NormalizedMedia {
  type: "image" | "video";
  url: string;
  previewUrl?: string | null;
}

export interface NormalizedBrand {
  platform: "meta" | "tiktok";
  platformPageId: string;
  name: string;
  logoUrl?: string | null;
  pageUrl?: string | null;
  category?: string | null;
  /** Facebook page likes at scrape time: a strong "real brand vs. dropshipper" signal. */
  likes?: number | null;
}

export interface NormalizedAd {
  source: string;
  sourceAdId: string;
  brand: NormalizedBrand | null;
  platforms: AdPlatform[];
  format: AdFormat;
  bodyText: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  landingUrl: string | null;
  landingDomain: string | null;
  countries: string[];
  /** ISO dates (YYYY-MM-DD). */
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  collationId: string | null;
  variationsCount: number;
  creativeHash: string;
  media: NormalizedMedia[];
  raw: unknown;
}

export interface KeywordQuery {
  term: string;
  country: string;
  limit: number;
  activeOnly?: boolean;
}

export interface BrandQuery {
  pageId: string;
  country?: string;
  limit: number;
  activeOnly?: boolean;
}

export interface SourceResult {
  ads: NormalizedAd[];
  /** Raw items the normalizer could not use (missing ad id etc.). */
  skipped: number;
  usd: number;
  units: number;
  meta?: Record<string, unknown>;
}

/** Pluggable ad data source (Meta API, Apify scraper, TikTok Creative Center, ...). */
export interface AdSource {
  readonly id: string;
  searchByKeyword(q: KeywordQuery): Promise<SourceResult>;
  getByBrand(q: BrandQuery): Promise<SourceResult>;
  normalize(raw: unknown): NormalizedAd | null;
}
