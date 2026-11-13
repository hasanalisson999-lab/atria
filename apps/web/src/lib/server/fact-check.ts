import "server-only";

/** The library facts an answer may cite as [A1], [A2]… (same order as the sources sent to the model). */
export interface CheckableAd {
  brand: string | null;
  headline: string | null;
  body_text: string | null;
  hook_text: string | null;
  days_running: number | null;
}

export interface FactCheck {
  /** Statements that cite library ads and were checked. */
  checked: number;
  issues: string[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%$ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Deterministic check of an answer against the ads it cites: references must exist, quotes attributed
 * to a cited brand must appear in that ad's copy, and "ran N days" claims must match the data.
 */
export function factCheck(text: string, ads: CheckableAd[]): FactCheck {
  const issues: string[] = [];
  let checked = 0;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const refs = [...sentence.matchAll(/A(\d+)/g)].map((m) => Number(m[1])).filter((n, i, arr) => arr.indexOf(n) === i && /\[[^\]]*A\d/.test(sentence));
    if (!refs.length) continue;
    checked++;
    const short = sentence.replace(/\s*\[[^\]]*\]/g, "").slice(0, 140);

    const missing = refs.filter((n) => n < 1 || n > ads.length);
    if (missing.length) issues.push(`Cites an ad that isn't in your library (${missing.map((n) => `A${n}`).join(", ")}): “${short}”`);
    const cited = refs.filter((n) => n >= 1 && n <= ads.length).map((n) => ads[n - 1]!);
    if (!cited.length) continue;

    // Quotes presented as a cited brand's own words must really be in that ad.
    const lower = sentence.toLowerCase();
    const aboutBrand = cited.filter((a) => a.brand && lower.includes(a.brand.toLowerCase()));
    if (aboutBrand.length) {
      for (const m of sentence.matchAll(/[“"]([^”"]{12,220})[”"]/g)) {
        const words = norm(m[1]!).split(" ").filter((w) => w.length > 2);
        if (words.length < 3) continue;
        const best = Math.max(
          ...aboutBrand.map((a) => {
            const corpus = ` ${norm([a.hook_text, a.headline, a.body_text].filter(Boolean).join(" "))} `;
            return words.filter((w) => corpus.includes(` ${w} `)).length / words.length;
          }),
        );
        if (best < 0.7) issues.push(`This quote isn't in the cited ${aboutBrand[0]!.brand} ad: “${m[1]!.slice(0, 100)}”`);
      }
    }

    // "ran 120 days" / "running for over 90 days" must match a cited ad.
    for (const m of sentence.matchAll(/(over|more than|nearly|almost|about|~)?\s*(\d{2,4})\s*\+?\s*days?/gi)) {
      const n = Number(m[2]);
      const qualifier = (m[1] ?? "").toLowerCase();
      const ok = cited.some((a) => {
        const d = a.days_running ?? -1;
        if (qualifier === "over" || qualifier === "more than") return d >= n;
        if (qualifier) return Math.abs(d - n) <= Math.max(5, n * 0.1);
        return Math.abs(d - n) <= 2 || d >= n;
      });
      if (!ok) issues.push(`The cited ad didn't run ${m[0]!.trim()} (library says ${cited.map((a) => `${a.days_running ?? "?"} days`).join(", ")}).`);
    }
  }
  return { checked, issues: [...new Set(issues)].slice(0, 6) };
}
