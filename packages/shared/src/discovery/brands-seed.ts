/**
 * Curated real brands. Signal resolves each one to its official Facebook page (via the public Ad
 * Library) and pulls that page's highest-impression ads. Footwear is the primary niche.
 * Edit freely: `query` is what we search, `aliases` are acceptable page names (case/space-insensitive).
 */
export type Niche = "footwear" | "apparel" | "supplements";

export interface SeedBrand {
  name: string;
  niche: Niche;
  query: string;
  aliases: string[];
  /** Official website: its footer links to the brand's real Facebook page. */
  domain?: string;
}

const b = (name: string, niche: Niche, aliases: string[] = [], query = name): SeedBrand => ({ name, niche, query, aliases: [name, ...aliases] });

const DOMAINS: Record<string, string> = {
  "On": "on.com",
  "HOKA": "hoka.com",
  "Nike": "nike.com",
  "adidas": "adidas.com",
  "Flux Footwear": "fluxfootwear.com",
  "New Balance": "newbalance.com",
  "Brooks Running": "brooksrunning.com",
  "ASICS": "asics.com",
  "Saucony": "saucony.com",
  "Salomon": "salomon.com",
  "Altra Running": "altrarunning.com",
  "Allbirds": "allbirds.com",
  "Vivobarefoot": "vivobarefoot.com",
  "Xero Shoes": "xeroshoes.com",
  "Topo Athletic": "topoathletic.com",
  "PUMA": "puma.com",
  "Mizuno Running": "mizunousa.com",
  "NOBULL": "nobullproject.com",
  "inov-8": "inov-8.com",
  "Reebok": "reebok.com",
  "Gymshark": "gymshark.com",
  "Vuori": "vuoriclothing.com",
  "lululemon": "lululemon.com",
  "Alo Yoga": "aloyoga.com",
  "Alphalete": "alphaleteathletics.com",
  "YoungLA": "youngla.com",
  "Represent": "representclo.com",
  "Rhone": "rhone.com",
  "Ten Thousand": "tenthousand.cc",
  "Oner Active": "oneractive.com",
  "TALA": "wearetala.com",
  "Set Active": "setactive.co",
  "GHOST": "ghostlifestyle.com",
  "Transparent Labs": "transparentlabs.com",
  "Optimum Nutrition": "optimumnutrition.com",
  "Myprotein": "myprotein.com",
  "Bloom Nutrition": "bloomnu.com"
};

const RAW_SEED: SeedBrand[] = [
  // Footwear (primary niche)
  b("On", "footwear", ["On Running", "On Running US", "On Running USA"], "On Running"),
  b("HOKA", "footwear", ["HOKA ONE ONE", "Hoka One One"]),
  b("Nike", "footwear", ["Nike Running"]),
  b("adidas", "footwear", ["adidas Running", "adidas US"]),
  b("Flux Footwear", "footwear", ["Flux", "Flux Adapt"]),
  b("New Balance", "footwear", ["New Balance Running"]),
  b("Brooks Running", "footwear", ["Brooks"]),
  b("ASICS", "footwear", ["ASICS America", "ASICS Running"]),
  b("Saucony", "footwear"),
  b("Salomon", "footwear", ["Salomon Running"]),
  b("Altra Running", "footwear", ["Altra"]),
  b("Allbirds", "footwear"),
  b("Vivobarefoot", "footwear"),
  b("Xero Shoes", "footwear"),
  b("Topo Athletic", "footwear"),
  b("PUMA", "footwear", ["PUMA Running"]),
  b("Mizuno Running", "footwear", ["Mizuno"]),
  b("NOBULL", "footwear"),
  b("inov-8", "footwear", ["inov8"]),
  b("Reebok", "footwear"),
  // Apparel
  b("Gymshark", "apparel"),
  b("Vuori", "apparel", ["Vuori Clothing"]),
  b("lululemon", "apparel"),
  b("Alo Yoga", "apparel", ["Alo"]),
  b("Alphalete", "apparel", ["Alphalete Athletics"]),
  b("YoungLA", "apparel", ["Young LA"]),
  b("Represent", "apparel", ["REPRESENT CLO", "Represent 247", "REPRESENT 247"], "Represent 247"),
  b("Rhone", "apparel"),
  b("Ten Thousand", "apparel"),
  b("Oner Active", "apparel"),
  b("TALA", "apparel", ["TALA Activewear"]),
  b("Set Active", "apparel"),
  // Supplements
  b("GHOST", "supplements", ["GHOST Lifestyle", "Ghost Lifestyle"]),
  b("Transparent Labs", "supplements"),
  b("Optimum Nutrition", "supplements"),
  b("Myprotein", "supplements", ["MyProtein"]),
  b("Bloom Nutrition", "supplements", ["Bloom"]),
];

export const SEED_BRANDS: SeedBrand[] = RAW_SEED.map((x) => ({ ...x, domain: DOMAINS[x.name] }));

/** Lowercase, strip accents/punctuation/spaces: "HOKA ONE ONE" -> "hokaoneone". */
export function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface PageCandidate {
  pageId: string;
  name: string;
  likes: number | null;
  ads: number;
}

/**
 * Picks the brand's official page among advertisers seen in search results.
 * Exact alias match wins; ties are broken by audience size, then by how many ads we saw.
 * Returns null rather than guessing when nothing matches.
 */
export function pickBrandPage(brand: SeedBrand, candidates: PageCandidate[]): PageCandidate | null {
  const aliases = new Set(brand.aliases.map(normName));
  const exact = candidates.filter((c) => aliases.has(normName(c.name)));
  const pool = exact.length ? exact : [];
  if (!pool.length) return null;
  return [...pool].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0) || b.ads - a.ads)[0] ?? null;
}

const FB_SKIP = new Set(["sharer", "sharer.php", "share", "share.php", "dialog", "tr", "plugins", "groups", "events", "policies", "watch", "login", "help", "privacy", "pages", "profile.php", "people", "hashtag", "business"]);

/** Extracts the brand's Facebook page handle from its homepage HTML (most-linked handle wins). */
export function facebookHandleFromHtml(html: string): string | null {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/facebook\.com\/(?:pg\/)?([A-Za-z0-9][A-Za-z0-9.\-]{1,60})/g)) {
    const h = m[1]!.replace(/\.+$/, "").toLowerCase();
    if (h.length < 2 || FB_SKIP.has(h)) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
