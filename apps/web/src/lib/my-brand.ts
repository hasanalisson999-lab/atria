/** Your brand: what Atria personalizes the feed, the AI Studio and every breakdown around. Shared by server and client. */

export const PRICE_TIERS = [
  { id: "budget", label: "Budget", hint: "Under $40" },
  { id: "mid", label: "Mid-range", hint: "$40–120" },
  { id: "premium", label: "Premium", hint: "$120–250" },
  { id: "luxury", label: "Luxury", hint: "$250+" },
] as const;
export type PriceTier = (typeof PRICE_TIERS)[number]["id"];

export const GOALS = [
  { id: "sales", label: "Drive sales", emoji: "💸" },
  { id: "launch", label: "Launch a product", emoji: "🚀" },
  { id: "awareness", label: "Build awareness", emoji: "📣" },
  { id: "ugc", label: "Find UGC angles", emoji: "🎥" },
  { id: "retention", label: "Win back customers", emoji: "🔁" },
  { id: "creative", label: "Refresh creatives", emoji: "🎨" },
] as const;

export const MARKETS = [
  { id: "US", label: "United States", flag: "🇺🇸" },
  { id: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { id: "DE", label: "Germany", flag: "🇩🇪" },
  { id: "FR", label: "France", flag: "🇫🇷" },
  { id: "NL", label: "Netherlands", flag: "🇳🇱" },
  { id: "IT", label: "Italy", flag: "🇮🇹" },
  { id: "ES", label: "Spain", flag: "🇪🇸" },
  { id: "CA", label: "Canada", flag: "🇨🇦" },
  { id: "AU", label: "Australia", flag: "🇦🇺" },
  { id: "AE", label: "UAE", flag: "🇦🇪" },
  { id: "SA", label: "Saudi Arabia", flag: "🇸🇦" },
  { id: "TR", label: "Türkiye", flag: "🇹🇷" },
] as const;

export interface MyBrand {
  id: string;
  name: string;
  url: string;
  logo: string | null;
  /** Catalog category id (footwear, apparel, skincare…). */
  category: string;
  products: string;
  priceTier: PriceTier;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  audience: string;
  voice: string;
  offers: string;
  markets: string[];
  /** Brands you compete with / look up to (names). */
  competitors: string[];
  keywords: string[];
  aesthetic: string[];
  goals: string[];
  onboardedAt: string | null;
  createdAt: string;
}

export const emptyBrand = (id: string): MyBrand => ({
  id,
  name: "",
  url: "",
  logo: null,
  category: "footwear",
  products: "",
  priceTier: "mid",
  priceMin: null,
  priceMax: null,
  currency: "USD",
  audience: "",
  voice: "",
  offers: "",
  markets: ["US"],
  competitors: [],
  keywords: [],
  aesthetic: [],
  goals: ["sales"],
  onboardedAt: null,
  createdAt: new Date(0).toISOString(),
});

/** Price band the feed leans towards for a tier (in the ad's currency, roughly USD-like). */
export function priceBand(b: Pick<MyBrand, "priceTier" | "priceMin" | "priceMax">): [number, number] {
  if (b.priceMin != null && b.priceMax != null && b.priceMax > b.priceMin) return [Math.max(0, b.priceMin * 0.6), b.priceMax * 1.5];
  return ({ budget: [0, 50], mid: [35, 140], premium: [100, 300], luxury: [220, 100000] } as const)[b.priceTier] as [number, number];
}
