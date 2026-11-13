import "server-only";
import { query, type Result } from "./db";

/** Everything Atria can learn about a brand from its ads, computed from the library (no paid calls). */

export interface Hook {
  text: string;
  ads: number;
  maxDays: number;
  active: number;
  exampleId: string;
  /** Ads (one per creative) that open with this hook. */
  adIds: string[];
  source: "copy" | "ai";
}
export interface Counted {
  label: string;
  n: number;
  exampleId?: string;
  extra?: string;
}
export interface Product {
  title: string;
  price: string | null;
  image: string | null;
  link: string | null;
  ads: number;
}
export interface BrandProfile {
  creatives: number;
  ads: number;
  active: number;
  hooks: Hook[];
  headlines: Counted[];
  keywords: Counted[];
  phrases: Counted[];
  offers: (Counted & { examples: string[] })[];
  discounts: number[];
  prices: { min: number; median: number; max: number; currency: string; count: number } | null;
  products: Product[];
  landingPages: Counted[];
  domains: Counted[];
  ctas: Counted[];
  formats: Counted[];
  platforms: Counted[];
  countries: Counted[];
  cadence: { week: string; n: number }[];
  longevity: Counted[];
  copy: { avgWords: number; emojiShare: number; questionShare: number; shortShare: number; longShare: number };
  winners: string[];
  aiAngles: Counted[];
  aiAudiences: Counted[];
  aiFormats: Counted[];
  analyzed: number;
}

interface Row {
  id: string;
  grp: string;
  body_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  landing_url: string | null;
  landing_domain: string | null;
  format: string;
  platforms: string[];
  countries: string[];
  start_date: string | null;
  days_running: number | null;
  is_active: boolean;
  raw: unknown;
  thumbnail_url: string | null;
  hook_text: string | null;
  hook_type: string | null;
  angle: string | null;
  target_audience: string | null;
  format_tags: string[] | null;
}

const STOP = new Set(
  "a an the and or but if then so to of in on at for with from by as is are was were be been it its this that these those you your yours we our us they their i me my he she his her them not no yes do does did can will just more most very all any some get got have has had new now up out off over into than too only also here there what when where who how why which while about via per one two three like make made".split(" "),
);
const EMOJI = /\p{Extended_Pictographic}/u;

const EN = new Set("the and you your for with our this that are is it to of in on a an be all new now get from more most made built every run running shop find best how what why who when can will one".split(" "));
/** Crude language check: English copy uses a few very common English words. */
function isEnglish(text: string): boolean {
  const w = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (w.length < 4) return true;
  return w.filter((x) => EN.has(x)).length / w.length >= 0.08;
}

/** A real opening line: no templates, URLs or fragments; mostly letters; at least 3 words. */
function isGoodHook(t: string): boolean {
  if (/\{\{|\}\}|https?:\/\/|www\./i.test(t)) return false;
  const words = t.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length < 3) return false;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters / Math.max(1, t.replace(/\s/g, "").length) >= 0.6;
}

const NOT_MODEL = new Set(
  "up to off save get only shop sale black friday cyber monday day days size sizes free over under top best the our new now week weeks hours hour pack pairs pair buy for and with all of in on at from code use your you men women kids mens womens".split(" "),
);
/** Footwear/apparel model names in copy, e.g. "Clifton 10", "Gel-Kayano 31", "Wave Rider 29". */
function modelNames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b((?:[A-Z][\p{L}-]*\s){1,3}\d{1,2})(?![\d%])(?:\s?(GTX|SR|Wide|Max|Trail))?\b/gu)) {
    const name = (m[1]! + (m[2] ? ` ${m[2]}` : "")).trim();
    const words = name.split(/\s+/).slice(0, -1);
    if (words.every((w) => NOT_MODEL.has(w.toLowerCase()))) continue;
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 10);
    if (/^\s*(days?|hours?|weeks?|years?|off|percent|%)/i.test(after)) continue;
    out.push(name.replace(/\s+/g, " "));
  }
  return out;
}

/** Product name from a landing URL (Shopify /products/x, /p/x, or the page before a SKU.html). */
function productFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const i = parts.findIndex((x) => ["products", "product", "p"].includes(x));
    let slug: string | null = i >= 0 ? (parts[i + 1] ?? null) : null;
    if (!slug) {
      const last = parts.at(-1) ?? "";
      if (/^\d+\.html?$|^[A-Z0-9-]{6,}\.html?$/i.test(last) && parts.length >= 2) slug = parts.at(-2)!;
    }
    if (!slug || slug.length < 4 || /^(collections?|shop|sale|men|women|kids|new|all)$/i.test(slug)) return null;
    return decodeURIComponent(slug)
      .replace(/\.html?$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{8,160}?[.!?…])(\s|$)/);
  return (m ? m[1]! : t.slice(0, 140)).trim();
}

function tally(values: (string | null | undefined)[], top = 12): Counted[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, n]) => ({ label, n }));
}

function cardsOf(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const snap = (r.snapshot ?? {}) as Record<string, unknown>;
  const c = (snap.cards ?? r.cards) as unknown;
  return Array.isArray(c) ? (c as Record<string, unknown>[]) : [];
}
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

const OFFER_RULES: { label: string; re: RegExp }[] = [
  { label: "Percent off", re: /\b(up to\s+)?\d{1,2}\s?%\s?off\b/i },
  { label: "Amount off", re: /[$£€]\s?\d+\s?off\b/i },
  { label: "Free shipping", re: /free (standard )?(shipping|delivery)/i },
  { label: "Free returns / exchanges", re: /free (returns?|exchanges?)/i },
  { label: "Risk-free trial / guarantee", re: /(risk[- ]free|money[- ]back|guarantee|\d+[- ]days? (trial|to (try|return)))/i },
  { label: "Buy X get Y / BOGO", re: /(bogo|buy (one|1|2|two)[^.]{0,12}get)/i },
  { label: "Promo code", re: /\b(use )?(promo )?code[: ]+[A-Z0-9]{3,}/ },
  { label: "Black Friday / Cyber", re: /(black friday|cyber (monday|week)|bfcm)/i },
  { label: "Sale / limited time", re: /\b(sale|limited[- ]time|ends (soon|tonight|today)|last chance|while supplies last)\b/i },
  { label: "Free gift / bonus", re: /free (gift|bonus|socks|sample)/i },
  { label: "Membership / rewards", re: /(member(ship)?|rewards?|loyalty|join .{0,20}free)/i },
  { label: "Bundle / set", re: /\b(bundle|2[- ]pack|3[- ]pack|kit)\b/i },
];

export function getBrandProfile(brandId: string, brandName: string): Promise<Result<BrandProfile>> {
  return query(async (sql) => {
    const rows = await sql<Row[]>`
      select a.id, coalesce(a.creative_group, a.id::text) as grp, a.body_text, a.headline, a.description, a.cta, a.landing_url, a.landing_domain,
             a.format::text as format, a.platforms, a.countries, a.start_date::text as start_date, a.days_running, a.is_active, a.raw, a.thumbnail_url,
             x.hook_text, x.hook_type, x.angle, x.target_audience, x.format_tags
      from public.ads a left join public.ad_analysis x on x.ad_id = a.id
      where a.brand_id = ${brandId}`;

    // One representative per creative for most stats (duplicates would skew counts).
    const byGroup = new Map<string, Row[]>();
    for (const r of rows) byGroup.set(r.grp, [...(byGroup.get(r.grp) ?? []), r]);
    const reps = [...byGroup.values()].map((g) => [...g].sort((a, b) => Number(b.is_active) - Number(a.is_active) || (b.days_running ?? 0) - (a.days_running ?? 0))[0]!);
    const brandWords = new Set(brandName.toLowerCase().split(/\W+/));

    // Hooks: opening line of the copy, merged across all ads that use it.
    const hookMap = new Map<string, Hook>();
    const grpOf = new Map(rows.map((r) => [r.id, r.grp]));
    for (const r of rows) {
      const text = r.body_text ? firstLine(r.body_text) : r.headline;
      if (!text || text.length < 6 || !isGoodHook(text)) continue;
      const key = text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
      const h = hookMap.get(key) ?? { text, ads: 0, maxDays: 0, active: 0, exampleId: r.id, adIds: [] as string[], source: "copy" as const };
      h.ads++;
      if (h.adIds.length < 24 && !h.adIds.some((id) => grpOf.get(id) === r.grp)) h.adIds.push(r.id);
      if (r.is_active) h.active++;
      if ((r.days_running ?? 0) > h.maxDays) {
        h.maxDays = r.days_running ?? 0;
        h.exampleId = r.id;
      }
      hookMap.set(key, h);
    }
    for (const r of rows) if (r.hook_text) hookMap.set(`ai:${r.hook_text.toLowerCase()}`, { text: r.hook_text, ads: 1, maxDays: r.days_running ?? 0, active: Number(r.is_active), exampleId: r.id, adIds: [r.id], source: "ai" });
    const hooks = [...hookMap.values()]
      .filter((h) => h.source === "ai" || isGoodHook(h.text))
      .sort((a, b) => Number(isEnglish(b.text)) - Number(isEnglish(a.text)) || Number(b.source === "ai") - Number(a.source === "ai") || b.maxDays - a.maxDays || b.ads - a.ads)
      .slice(0, 80);

    // Messaging keywords and two-word phrases.
    const uni = new Map<string, number>();
    const bi = new Map<string, number>();
    // Regional pages add foreign-language noise: use English copy when the brand has enough of it.
    const english = reps.filter((r) => isEnglish(`${r.headline ?? ""} ${r.body_text ?? ""}`));
    for (const r of english.length >= Math.min(8, reps.length * 0.3) ? english : reps) {
      const words = `${r.headline ?? ""} ${r.body_text ?? ""}`.toLowerCase().replace(/https?:\S+/g, " ").match(/[\p{L}][\p{L}'’-]+/gu) ?? [];
      const clean = words.filter((w) => w.length > 2 && !STOP.has(w) && !brandWords.has(w));
      for (const w of new Set(clean)) uni.set(w, (uni.get(w) ?? 0) + 1);
      const pairs = new Set<string>();
      for (let i = 0; i < words.length - 1; i++) {
        const a = words[i]!;
        const b = words[i + 1]!;
        if (a.length > 2 && b.length > 2 && !STOP.has(a) && !STOP.has(b) && !brandWords.has(a) && !brandWords.has(b)) pairs.add(`${a} ${b}`);
      }
      for (const p of pairs) bi.set(p, (bi.get(p) ?? 0) + 1);
    }
    const toCounted = (m: Map<string, number>, top: number, min = 2) => [...m.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, n]) => ({ label, n }));

    // Offers, discounts and prices (copy + catalog cards).
    const offers = OFFER_RULES.map((rule) => ({ label: rule.label, n: 0, examples: [] as string[] }));
    const discounts: number[] = [];
    const prices: number[] = [];
    let currency = "$";
    const productMap = new Map<string, Product & { groups: Set<string> }>();
    const addProduct = (title: string, r: Row, extra: { price?: string | null; image?: string | null; link?: string | null } = {}) => {
      const clean = title
        .replace(/\s+/g, " ")
        .replace(/^the\s+/i, "")
        .replace(/[.,!?:;]+$/, "")
        .trim();
      if (clean.length < 3 || clean.length > 60 || /\{\{/.test(clean) || clean.toLowerCase() === brandName.toLowerCase()) return;
      // Prices, offers and sentences are not products.
      if (/[$£€%]|^(now|save|get|shop|buy|up to|from|only|new in)\b/i.test(clean) || clean.split(" ").length > 6) return;
      const key = clean.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const p = productMap.get(key) ?? { title: clean, price: null, image: null, link: null, ads: 0, groups: new Set<string>() };
      p.price ??= extra.price ?? null;
      p.image ??= extra.image ?? null;
      p.link ??= extra.link ?? null;
      p.groups.add(r.grp);
      p.ads = p.groups.size;
      productMap.set(key, p);
    };
    // Every ad (not one per creative): carousel/catalog cards, model names in the copy, product URLs.
    for (const r of rows) {
      for (const c of cardsOf(r.raw)) {
        const title = s(c.title);
        if (!title) continue;
        const price = s(c.link_description ?? c.linkDescription)?.match(/[$£€]\s?\d[\d.,]*/)?.[0] ?? null;
        const link = s(c.link_url ?? c.linkUrl ?? c.link);
        // Carousel cards are often taglines ("Layer up and go"): keep only product-looking cards.
        const looksLikeProduct = !!price || /\d/.test(title) || !!productFromUrl(link) || r.format === "dco";
        if (!looksLikeProduct) continue;
        addProduct(title, r, {
          price,
          image: s(c.resized_image_url ?? c.resizedImageUrl ?? c.resized_image ?? c.original_image_url ?? c.originalImageUrl ?? c.original_image ?? c.imageUrl),
          link,
        });
      }
      for (const m of new Set(modelNames(`${r.headline ?? ""}\n${r.body_text ?? ""}`))) addProduct(m, r, { image: r.thumbnail_url, link: r.landing_url });
      const fromUrl = productFromUrl(r.landing_url);
      if (fromUrl) addProduct(fromUrl, r, { image: r.thumbnail_url, link: r.landing_url });
    }
    for (const r of reps) {
      const cards = cardsOf(r.raw);
      const texts = [r.headline, r.body_text, r.description, ...cards.flatMap((c) => [s(c.title), s(c.body), s(c.link_description ?? c.linkDescription)])].filter(Boolean) as string[];
      const all = texts.join(" \n ");
      OFFER_RULES.forEach((rule, i) => {
        const m = all.match(rule.re);
        if (m) {
          offers[i]!.n++;
          if (offers[i]!.examples.length < 3) {
            const at = all.indexOf(m[0]);
            offers[i]!.examples.push(all.slice(Math.max(0, at - 40), at + m[0].length + 50).replace(/\s+/g, " ").trim());
          }
        }
      });
      for (const m of all.matchAll(/(\d{1,2})\s?%\s?off/gi)) discounts.push(Number(m[1]));
      for (const m of all.matchAll(/([$£€])\s?(\d{1,4}(?:[.,]\d{2})?)\b/g)) {
        const v = Number(m[2]!.replace(",", "."));
        if (v >= 5 && v <= 2000) {
          prices.push(v);
          currency = m[1]!;
        }
      }
    }
    prices.sort((a, b) => a - b);

    // Landing pages (path without tracking params).
    const pages = tally(
      reps.map((r) => {
        if (!r.landing_url) return null;
        try {
          const u = new URL(r.landing_url);
          return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "") || "/"}`;
        } catch {
          return null;
        }
      }),
      15,
    );

    // Cadence: new creatives per ISO week, last 26 weeks.
    const weeks = new Map<string, number>();
    const now = new Date();
    for (let i = 25; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 86_400_000);
      weeks.set(isoWeekStart(d), 0);
    }
    for (const r of reps) {
      if (!r.start_date) continue;
      const k = isoWeekStart(new Date(`${r.start_date.slice(0, 10)}T00:00:00Z`));
      if (weeks.has(k)) weeks.set(k, weeks.get(k)! + 1);
    }

    const buckets: [string, (d: number) => boolean][] = [
      ["< 1 week", (d) => d < 7],
      ["1–4 weeks", (d) => d >= 7 && d < 30],
      ["1–3 months", (d) => d >= 30 && d < 90],
      ["3–6 months", (d) => d >= 90 && d < 180],
      ["6–12 months", (d) => d >= 180 && d < 365],
      ["1 year +", (d) => d >= 365],
    ];
    const longevity = buckets.map(([label, f]) => ({ label, n: reps.filter((r) => r.days_running != null && f(r.days_running)).length }));

    const bodies = reps.map((r) => r.body_text ?? "").filter(Boolean);
    const wc = bodies.map((b) => b.split(/\s+/).length);
    const share = (f: (b: string) => boolean) => (bodies.length ? Math.round((bodies.filter(f).length / bodies.length) * 100) : 0);

    return {
      creatives: reps.length,
      ads: rows.length,
      active: reps.filter((r) => r.is_active).length,
      hooks,
      headlines: tally(rows.map((r) => r.headline).filter((h) => h && h.toLowerCase() !== brandName.toLowerCase() && !/\{\{/.test(h)), 20),
      keywords: toCounted(uni, 30),
      phrases: toCounted(bi, 20),
      offers: offers.filter((o) => o.n > 0).sort((a, b) => b.n - a.n),
      discounts: [...new Set(discounts)].sort((a, b) => a - b),
      prices: prices.length ? { min: prices[0]!, median: prices[Math.floor(prices.length / 2)]!, max: prices[prices.length - 1]!, currency, count: prices.length } : null,
      products: [...productMap.values()]
        .sort((a, b) => b.ads - a.ads || Number(!!b.image) - Number(!!a.image))
        .slice(0, 80)
        .map(({ groups: _g, ...p }) => {
          void _g;
          return p;
        }),
      landingPages: pages,
      domains: tally(reps.map((r) => r.landing_domain), 8),
      ctas: tally(reps.map((r) => r.cta), 10),
      formats: tally(reps.map((r) => (r.format === "dco" ? "dynamic" : r.format)), 6),
      platforms: tally(reps.flatMap((r) => r.platforms), 6),
      countries: tally(rows.flatMap((r) => r.countries), 12),
      cadence: [...weeks.entries()].map(([week, n]) => ({ week, n })),
      longevity,
      copy: {
        avgWords: wc.length ? Math.round(wc.reduce((a, b) => a + b, 0) / wc.length) : 0,
        emojiShare: share((b) => EMOJI.test(b)),
        questionShare: share((b) => firstLine(b).includes("?")),
        shortShare: share((b) => b.split(/\s+/).length <= 20),
        longShare: share((b) => b.split(/\s+/).length >= 80),
      },
      winners: [...reps].filter((r) => r.is_active).sort((a, b) => (b.days_running ?? 0) - (a.days_running ?? 0)).slice(0, 10).map((r) => r.id),
      aiAngles: tally(rows.map((r) => r.angle), 8),
      aiAudiences: tally(rows.map((r) => r.target_audience), 6),
      aiFormats: tally(rows.flatMap((r) => r.format_tags ?? []), 10),
      analyzed: rows.filter((r) => r.hook_text).length,
    };
  });
}

function isoWeekStart(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}
