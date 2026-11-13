/**
 * AI-slop detector, based on petergyang/no-ai-slop (skills/no-ai-slop/SKILL.md).
 *
 * Pure and deterministic, so it runs in the browser (live highlighting) and on the server (to decide
 * which lines the AI must rewrite). Each hit names the pattern, quotes the line and gives a short fix,
 * exactly like the skill's "Detect" job. It never guesses whether AI wrote something.
 */

export type SlopSeverity = "high" | "soft";

export interface SlopHit {
  id: string;
  label: string;
  fix: string;
  severity: SlopSeverity;
  /** The matched words. */
  match: string;
  /** Character range of the match inside the scanned text. */
  start: number;
  end: number;
}

interface Rule {
  id: string;
  label: string;
  fix: string;
  severity: SlopSeverity;
  re: RegExp;
  /** Only flag when the rule matches at least this many times in the whole text. */
  min?: number;
}

const words = (list: string[]) => new RegExp(`\\b(?:${list.map((w) => w.replace(/[-\s]+/g, "[-\\s]+")).join("|")})\\b`, "gi");

const BANNED = [
  "delve", "delves", "delving", "foster", "fostering", "leverage", "leveraging", "utilize", "utilizing", "facilitate", "empower", "empowering", "empowers",
  "streamline", "streamlined", "robust", "cutting-edge", "paradigm shift", "game changer", "game-changing", "this is huge", "this changes everything",
  "tapestry", "realm", "beacon", "multifaceted", "meticulous", "meticulously", "intricate", "paramount", "transformative", "elevate", "elevates",
  "elevated", "elevating", "embark", "embarking", "supercharge", "supercharged", "harness", "harnessing", "ever-evolving",
];

// Words AI reaches for in ad copy and "teen" scripts. Not in the repo's list, but the same failure: hype instead of a fact.
const HYPE = [
  "revolutionize", "revolutionizing", "revolutionary", "unleash", "unleashing", "seamless", "seamlessly", "next level", "next-level", "ultimate",
  "unparalleled", "unmatched", "world-class", "redefine", "redefining", "reimagine", "reimagined", "effortless", "effortlessly", "in a league of its own",
  "take it to the next level", "look no further", "designed with you in mind", "the perfect blend", "best of both worlds", "say goodbye to", "unlock your",
  "level up your", "elevate your", "crafted for", "engineered for", "built different", "versatile", "everything in between", "and everything between", "must-have", "a perfect fit for", "perfect for any", "on the go", "all-day comfort",
];

const FORCED_SLANG = ["no cap", "bussin", "it's giving", "fr fr", "rizz", "slay", "sheesh", "on god", "periodt", "hits different", "main character energy"];

const EMPTY_PHRASES = [
  "it's worth noting", "it is worth noting", "it's important to note", "it is important to note", "at the end of the day", "when it comes to", "at its core",
  "in today's world", "in the age of", "in the world of", "the reality is", "the truth is", "in terms of", "with regard to", "in order to", "going forward",
  "in this article", "in this video", "let's dive in", "let's dive into", "dive into", "dive deep",
];

const RULES: Rule[] = [
  { id: "banned", label: "AI word", fix: "Use the plain word", severity: "high", re: words(BANNED) },
  { id: "hype", label: "Hype word", fix: "Say the concrete thing instead", severity: "high", re: words(HYPE) },
  { id: "slang", label: "Forced slang", fix: "Talk how you'd text a friend, without trend slang", severity: "high", re: words(FORCED_SLANG) },
  { id: "phrase", label: "Empty phrase", fix: "Cut it and start with the point", severity: "high", re: words(EMPTY_PHRASES) },
  {
    id: "adverb-strong",
    label: "Empty adverb",
    fix: "Cut it",
    severity: "high",
    re: /\b(?:truly|fundamentally|importantly|crucially|inherently|inevitably|incredibly|absolutely|currently)\b/gi,
  },
  {
    id: "adverb",
    label: "Filler adverbs pile up",
    fix: "Keep one or two at most, where you'd say them out loud",
    severity: "soft",
    re: /\b(?:just|literally|honestly|simply|actually)\b/gi,
    min: 4,
  },
  {
    id: "contrast",
    label: "Binary contrast",
    fix: "State the second half directly",
    severity: "high",
    re: /\b(?:it'?s|this is|that'?s|they'?re|we'?re|i'?m|you'?re)\s+not\s+(?:just\s+)?(?:about\s+)?[^.!?\n]{1,45}?[.,;:]\s*(?:it'?s|this is|that'?s|they'?re|we'?re|i'?m|you'?re)\b|\b(?:isn'?t|aren'?t|wasn'?t)\s+(?:just\s+)?(?:about\s+)?[^.!?\n]{1,45}?[,;.]\s*(?:it'?s|they'?re|it was|it is)\b|\bnot just\b[^.!?\n]{1,50}?\bbut\b|\bmore than just\b/gi,
  },
  {
    id: "throat",
    label: "Throat-clearing opener",
    fix: "Cut it and say the point",
    severity: "high",
    re: /\b(?:here'?s the thing|here'?s what i mean|let me be clear|i'?ll be honest|let'?s be honest|let'?s be real|the uncomfortable truth|let me tell you|real talk)\b/gi,
  },
  {
    id: "faux-insight",
    label: "Faux-insight setup",
    fix: "Drop the setup, make the claim",
    severity: "high",
    re: /\b(?:(?:this is )?the part (?:most people|everyone|nobody|no one) (?:skip|miss|get)s?\w*|what (?:most people|everyone|nobody) (?:gets? wrong|misses|knows)|(?:nobody|no one) (?:tells|told|talks about) (?:you|this)|what they don'?t tell you|the secret (?:is|to)|here'?s the secret)\b/gi,
  },
  {
    id: "colon-reveal",
    label: "Colon reveal",
    fix: "Write it as a plain sentence",
    severity: "high",
    re: /\b(?:the|my|our|here'?s the) (?:best|worst|real|key|crazy|wild|funny|hard|hardest|scary|catch|craziest|kicker|twist|goal|plan|result|secret|truth|problem|difference|reason)(?: (?:part|thing|bit|detail|secret|truth|news))?:\s+(?=[a-z])/gi,
  },
  {
    id: "rhetorical",
    label: "Rhetorical setup",
    fix: "Make the point without the setup",
    severity: "high",
    re: /\b(?:what if i told you|think about it[:.]|plot twist|picture this|imagine this|ever wondered|guess what\??|the (?:result|answer|secret|catch|difference|problem|best part|kicker)\?)/gi,
  },
  {
    id: "superficial",
    label: "Superficial analysis",
    fix: "Say what it actually does",
    severity: "high",
    re: /,\s+(?:highlighting|underscoring|reflecting|showcasing|emphasizing|demonstrating|symbolizing|cementing|solidifying|signaling)\b/gi,
  },
  {
    id: "puffery",
    label: "Importance puffery",
    fix: "State the fact and let the viewer judge",
    severity: "high",
    re: /\b(?:stands? as a testament|a testament to|pivotal moment|plays? an? (?:vital|crucial|key|pivotal|important) role|solidif(?:y|ies) (?:its|their) position|underscores? (?:its|the) (?:significance|importance)|marks? a (?:new|pivotal|major) (?:era|chapter|milestone)|a new era)\b/gi,
  },
  {
    id: "meta",
    label: "Telling the reader what to think",
    fix: "Delete the aside",
    severity: "high",
    re: /\b(?:that last part matters|the key (?:point|takeaway) is|as you can see|this distinction matters|in other words|let that sink in|read that again|and that'?s the point)\b/gi,
  },
  {
    id: "weasel",
    label: "Weasel attribution",
    fix: "Name the source or cut the claim",
    severity: "high",
    re: /\b(?:experts? (?:agree|say|recommend)|industry reports?|many (?:argue|believe|say)|widely regarded|studies (?:show|suggest|prove)|research (?:shows|suggests|proves)|doctors recommend|science says|scientifically proven)\b/gi,
  },
  { id: "verb", label: "Fake-strong verb", fix: 'Use "is" or say what it does', severity: "soft", re: /\b(?:serves as|stands as|functions as|acts as) an?\b/gi },
  {
    id: "negative-list",
    label: "Negative listing",
    fix: "Just say what it is",
    severity: "high",
    re: /\bnot an? [^.!?\n]{1,30}\.\s+not an? [^.!?\n]{1,30}\./gi,
  },
  {
    id: "fragments",
    label: "Dramatic fragments",
    fix: "Use complete sentences",
    severity: "high",
    re: /\bthat'?s it\.\s+that'?s\b|\.\s+and [^.!?\n]{1,30}\.\s+and [^.!?\n]{1,30}\./gi,
  },
  {
    id: "recap",
    label: "Summary ending",
    fix: "End on the last concrete point or the next step",
    severity: "high",
    re: /(?:^|[.!?]\s+)(?:in conclusion|ultimately|overall|in summary|to sum up|all in all),/gi,
  },
  { id: "dash", label: "Em dash", fix: "Use a comma or a full stop", severity: "high", re: /\s?[—–]\s?|\s--\s/g },
  { id: "exclaim", label: "Too many exclamation marks", fix: "Keep one at most", severity: "soft", re: /!/g, min: 3 },
  { id: "emoji", label: "Emoji pile-up", fix: "Two at most", severity: "soft", re: /\p{Extended_Pictographic}/gu, min: 3 },
  {
    id: "journey",
    label: "Cliché call to follow",
    fix: "Say what they'll see if they follow",
    severity: "high",
    re: /\b(?:journey|join (?:me|us) (?:on|as)|follow along (?:on|for) (?:this|my|the)|smash (?:that|the) (?:like|follow)|don'?t forget to (?:like|follow|subscribe))\b/gi,
  },
  {
    id: "from-to",
    label: 'Cliché "from X to Y"',
    fix: "Name one real moment instead",
    severity: "soft",
    re: /\bfrom (?:the )?(?:gym|class|classroom|office|boardroom|court|track|trail|morning|sunrise|day) to (?:the )?(?:streets?|office|boardroom|court|track|night|city|sunset|weekend|everywhere)\b/gi,
  },
  {
    id: "whether",
    label: '"Whether you\'re…" template',
    fix: "Pick one person and talk to them",
    severity: "soft",
    re: /\bwhether you'?re\b/gi,
  },
  {
    id: "stiff",
    label: "Stiff when said out loud",
    fix: "Use contractions: I'm, it's, don't",
    severity: "high",
    min: 2,
    re: /\b(?:I am|I have been|I will|I would|do not|does not|did not|is not|are not|was not|cannot|can not|it is|that is|we are|you are|they are|let us|here is|what is)\b/gi,
  },
  // Founder scripts: the AI doesn't know the founder's real story, so it must not make it up.
  {
    id: "invented",
    label: "Made-up detail",
    fix: "Put the real number in [brackets] or cut it",
    severity: "high",
    re: /\b(?:for|after|spent|over|in) (?:the (?:last|past) )?(?:(?:\d[\d,]*|a couple of|a few|several|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|a hundred|hundreds of) )?(?:days|weeks|months|years)\b|\b(?:\d[\d,]*|a couple of|a few|several|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|a hundred|hundreds of) (?:days|weeks|months|years) ago\b|\b(?:over |about |almost |nearly |like )?(?:\d[\d,]*|a couple of|a few|several|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|a hundred|hundreds of)\+?\s+(?:people|followers|orders|preorders|prototypes|samples|sign-?ups|customers|emails|factories|suppliers|manufacturers|versions|iterations|designs|sketches|dollars|bucks|hours|calls|DMs|comments)\b|\b(?:prototype|sample|version) (?:number )?(?:two|three|four|five|\d)\b|\b(?:last|this past) (?:semester|summer|winter|year|month)\b/gi,
  },
  {
    id: "gender",
    label: "Guesses your gender",
    fix: 'Write directions as "you"',
    severity: "high",
    re: /\b(?:his|her|he|she|himself|herself|him)\b/gi,
  },
];

/** What kind of text a field is: plain copy, a line the founder says, or an on-screen direction. */
export type FieldKind = "copy" | "say" | "show";

/** Every match, ignoring the count thresholds (used to compare a line before and after an edit). */
export function scanOne(text: string, kind: FieldKind): SlopHit[] {
  const hits: SlopHit[] = [];
  if (!text) return hits;
  // Bracketed placeholders like [cushioning material] are instructions to the founder, never slop.
  const scan = text.replace(/\[[^\]\n]{1,80}\]/g, (m) => " ".repeat(m.length));
  for (const r of RULES) {
    if (r.id === "invented" && kind !== "say") continue;
    if (r.id === "gender" && kind !== "show") continue;
    if (r.id === "stiff" && kind !== "say") continue;
    r.re.lastIndex = 0;
    for (const m of scan.matchAll(r.re)) {
      if (!m[0].trim()) continue;
      const lead = m[0].length - m[0].trimStart().length;
      const start = (m.index ?? 0) + lead;
      const len = m[0].trim().length;
      hits.push({ id: r.id, label: r.label, fix: r.fix, severity: r.severity, match: text.slice(start, start + len), start, end: start + len });
    }
  }
  return hits;
}

const MIN = new Map(RULES.filter((r) => r.min).map((r) => [r.id, r.min!]));

/** Drops count-based hits (filler adverbs, "!") that stay under their threshold across the whole piece. */
function applyMinimums<T extends SlopHit>(hits: T[]): T[] {
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(h.id, (counts.get(h.id) ?? 0) + 1);
  return hits.filter((h) => (counts.get(h.id) ?? 0) >= (MIN.get(h.id) ?? 1));
}

/** Scans one piece of text for AI patterns (the Human check tool). */
export function detectSlop(text: string, kind: FieldKind = "copy"): SlopHit[] {
  return applyMinimums(scanOne(text, kind)).sort((a, b) => a.start - b.start);
}

export interface FieldHit extends SlopHit {
  path: string;
}

/** Scans several fields of one piece (e.g. every line of a script); thresholds count across all of them. */
export function detectFields(fields: { path: string; text: string; kind: FieldKind }[]): FieldHit[] {
  return applyMinimums(fields.flatMap((f) => scanOne(f.text, f.kind).map((h) => ({ ...h, path: f.path }))));
}

/** Hits grouped by pattern, for compact reports ("Em dash ×3"). */
export function groupHits(hits: SlopHit[]): { id: string; label: string; fix: string; severity: SlopSeverity; matches: string[] }[] {
  const map = new Map<string, { id: string; label: string; fix: string; severity: SlopSeverity; matches: string[] }>();
  for (const h of hits) {
    const g = map.get(h.id) ?? { id: h.id, label: h.label, fix: h.fix, severity: h.severity, matches: [] };
    if (!g.matches.includes(h.match)) g.matches.push(h.match);
    map.set(h.id, g);
  }
  return [...map.values()].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

/** Mechanical fixes that never need a model: em dashes become commas, doubled spaces collapse. */
export function cleanText(s: string): string {
  return s
    .replace(/\s*[—–]\s*(?=[A-Z])/g, ". ")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s--\s/g, ", ")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The writing rules every Brand Lab prompt carries. Condensed from no-ai-slop's SKILL.md, plus what it means
 * for spoken founder videos.
 */
export const WRITING_GUIDE = `WRITING RULES (no AI slop, from the no-ai-slop editing guide):
- Be concrete and specific. Names, numbers, mechanisms and real moments beat abstractions, but only facts you were given; never make up numbers or events to sound specific. Portability test: if a sentence could be moved unchanged to another brand or product, cut it or make it specific.
- Show, don't tell the viewer what to think. Never label something "important", "crazy" or "game-changing"; show the fact and let them judge.
- Active voice with human subjects. Direct verbs ("decided", not "made a decision"). Prefer "is" and "has" over "serves as".
- Repeat the clear word instead of rotating synonyms.
- Never use these words: delve, foster, leverage, utilize, facilitate, empower, streamline, robust, cutting-edge, paradigm shift, game changer, tapestry, realm, beacon, multifaceted, meticulous, intricate, paramount, transformative, elevate, embark, supercharge, harness, ever-evolving, revolutionize, unleash, seamless, ultimate, next-level, journey.
- No filler: it's worth noting, at the end of the day, when it comes to, at its core, in today's world, the reality is, the truth is, in order to, let's dive in. No empty adverbs (truly, fundamentally, crucially, importantly).
- Banned patterns: binary contrasts ("It's not X, it's Y" / "not just X but Y"), throat-clearing ("Here's the thing", "Let's be real"), faux insight ("what nobody tells you"), colon reveals ("The best part: it…"), rhetorical setups ("What if I told you", "The result? …"), trailing "-ing" analysis (", highlighting…"), puffery ("a testament to", "a new era"), weasel sources ("experts agree", "studies show"), negative listing ("Not a X. Not a Y. A Z."), dramatic fragments ("That's it. That's the whole thing."), fake-profound kicker lines, and recap endings ("Ultimately," "Overall,").
- No em dashes or en dashes at all. Use commas and full stops.
- At most one exclamation mark per piece. No emoji except at most two in a caption.
- Vary sentence length the way people talk. No stacks of three-word punchy fragments, no identical sentence shapes in a row.
- Ad copy: no "Whether you're X or Y", no "from the gym to the streets", no "say goodbye to", no "meet your new". Talk to one person about one real moment.`;

export const VOICE_GUIDE = `HOW THE FOUNDER TALKS ON CAMERA:
- A real 17-year-old talking to their phone. ALWAYS use contractions (I'm, it's, don't, I've, that's); "I am" and "do not" sound like a robot reading. Write numbers as digits ("I'm 17"). Don't copy the wording of the topic; say it the way you'd say it out loud.
- Plain words, short and long sentences mixed, the odd "like" or "honestly" only where a person would say it. No trend slang (no "no cap", "it's giving", "bussin", "slay"). No announcer voice, no ad voice.
- Specific beats hype. "The toe box on this one is too narrow, so I'm fixing that" beats "this shoe is going to change everything".
- Admit what's unfinished or hard. Small honest admissions make people trust you.
- You know ONLY what's in the brand brief and the topic. You do NOT know: whether a prototype or sample exists yet or which number it is, any timeline (how long, how many weeks ago, when the next one lands), factories, suppliers, calls, emails, materials being tested, production costs, launch date, preorders, follower counts, sales, the founder's school (classes, schedule, wake-up time), or how the shoe feels. NEVER state any of these as fact. Being specific means a vivid, true-for-everyone moment ("carrying a second pair of shoes in my backpack"), or a [placeholder] for the founder's real detail. The price range in the brief IS known: say it plainly ("around $99"), never as a placeholder. When a real detail is needed, put a short placeholder in square brackets inside a natural sentence, so the founder only swaps the bracket: "Prototype one took [how many] weeks to show up." / "The first sample came back and [what was wrong with it]." Max 4 placeholders per script. Never build a whole line around a placeholder. If the topic gives a fact (e.g. "my first prototype arrived"), use it.
- On-screen directions ("show") speak to the founder as "you" ("You hold the box up to the camera"). Never guess the founder's gender (no he/she/his/her).
- The call to action is plain and specific: say what they'll see if they follow ("I'm filming the next sample when it lands"). Never "join me on this journey", never "smash that follow".
- Bad: "Join me on this incredible journey as I revolutionize footwear!" Good: "I'm 17 and I'm trying to make one shoe I can wear to school, the gym and on a long walk without switching. This is how far I've got."`;

const SKIP_KEYS = new Set(["hex", "t", "platform", "format", "length", "hashtags", "inspiredBy", "heading", "body", "name", "title", "trait", "id", "status", "createdAt", "updatedAt", "wordsAvoid", "voiceDont", "angle"]);

/** Every user-facing string in a generated object, with its path and kind ("say" for spoken lines and hooks). */
export function textFields(data: unknown, prefix = ""): { path: string; text: string; kind: FieldKind }[] {
  const out: { path: string; text: string; kind: FieldKind }[] = [];
  const walk = (v: unknown, path: string, key: string) => {
    if (typeof v === "string") {
      if (v.trim()) out.push({ path, text: v, kind: key === "say" || key === "hook" ? "say" : key === "show" ? "show" : "copy" });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i), key));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) if (!SKIP_KEYS.has(k)) walk(x, path ? `${path}.${k}` : k, k);
    }
  };
  walk(data, prefix, "");
  return out;
}

/** Sets a dotted path ("lines.3.say") inside an object, in place. Returns false if the path doesn't exist. */
export function setPath(data: unknown, path: string, value: string): boolean {
  const parts = path.split(".");
  let cur: unknown = data;
  for (const p of parts.slice(0, -1)) {
    if (!cur || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  const last = parts.at(-1)!;
  if (!cur || typeof cur !== "object" || typeof (cur as Record<string, unknown>)[last] !== "string") return false;
  (cur as Record<string, unknown>)[last] = value;
  return true;
}

/** Applies cleanText to every user-facing string of a generated object, in place. */
export function cleanAll(data: unknown): void {
  for (const f of textFields(data)) setPath(data, f.path, cleanText(f.text));
}
