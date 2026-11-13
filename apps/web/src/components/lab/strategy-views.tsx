"use client";

import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { useAdPanel } from "@/components/ad/ad-panel";
import type { Branding, Ideas, Positioning, Remix } from "@/lib/server/lab";
import type { StudioSource } from "@/lib/server/studio";
import { cn } from "@/lib/utils";
import { DocBlock, DocShell, DocTitle, EditableText, gutter, type DocChapter } from "./lab-doc";
import { arr, beat, Chip, CopyBtn, useCopy } from "./lab-ui";

/** Saves one edited string of a section, by its path in the saved object (e.g. "taglines.2"). */
export type OnEdit = (path: string, value: string) => void;

interface ViewProps<T> {
  d: T;
  /** Chapter in the URL (/lab/<section>/<chapter>). */
  chapter: string | null;
  onChapter: (id: string) => void;
  onEdit: OnEdit;
}

type Chapter = DocChapter & { render: () => ReactNode };

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const lead = "text-[1.1rem] leading-relaxed text-foreground/90";
const label = "text-[0.72rem] font-medium tracking-wide text-muted-foreground uppercase";
const big = "text-[1.3rem] leading-snug font-semibold tracking-[-0.015em]";

/** Shows the chapter in the URL (or the first one) inside the document shell. */
function Chapters({ base, chapters, chapter, onChapter }: { base: string; chapters: Chapter[]; chapter: string | null; onChapter: (id: string) => void }) {
  const i = Math.max(0, chapters.findIndex((c) => c.id === chapter));
  const cur = chapters[i];
  return (
    <div className="max-w-[820px]">
      <DocShell chapters={chapters} active={cur?.id ?? null} onSelect={onChapter}>
        {cur && (
          <article className="flex flex-col gap-8">
            <DocTitle n={i + 1} link={`${base}/${cur.id}`}>
              {cur.title}
            </DocTitle>
            {cur.render()}
          </article>
        )}
      </DocShell>
    </div>
  );
}

const Hint = ({ children }: { children: ReactNode }) => <p className={cn("-mt-3 text-[0.95rem] text-muted-foreground", gutter)}>{children}</p>;

// ------------------------------------------------------------------ positioning

export function PositioningView({ d, chapter, onChapter, onEdit }: ViewProps<Positioning>) {
  const chapters: Chapter[] = [
    {
      id: "statement",
      title: "Positioning statement",
      render: () => (
        <div className={cn("flex flex-col gap-8", gutter)}>
          <div className="relative rounded-3xl bg-ink p-7 pr-14 text-ink-foreground sm:p-9 sm:pr-16">
            <EditableText label="one-liner" value={d.oneLiner ?? ""} onSave={(v) => v && onEdit("oneLiner", v)} className="text-[1.65rem] leading-[1.2] font-semibold tracking-[-0.02em] text-balance hover:bg-white/10 sm:text-[2rem]" />
            <CopyBtn text={`${d.oneLiner}\n\n${d.pitch}`} className="absolute top-4 right-4 text-ink-foreground/60 hover:bg-white/10 hover:text-ink-foreground" />
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>Elevator pitch</span>
            <EditableText label="pitch" value={d.pitch ?? ""} onSave={(v) => onEdit("pitch", v)} className={lead} />
          </div>
        </div>
      ),
    },
    {
      id: "taglines",
      title: "Taglines",
      render: () => (
        <>
          <Hint>Click the words to edit, or the icon to copy.</Hint>
          <ol className={cn("flex flex-col", gutter)}>
            {arr(d.taglines).map((t, i) => (
              <li key={i} className="flex items-center gap-4 border-b py-4 first:border-t">
                <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                <EditableText label="tagline" singleLine value={t} onSave={(v) => v && onEdit(`taglines.${i}`, v)} className={cn("min-w-0 flex-1", big)} />
                <CopyBtn text={t} />
              </li>
            ))}
          </ol>
        </>
      ),
    },
    {
      id: "descriptions",
      title: "Descriptions",
      render: () => (
        <div className="flex flex-col gap-10">
          {[
            { k: "Ad description", hint: "For ad copy and captions", tag: "Ad", path: "shortDescription", v: d.shortDescription ?? "" },
            { k: "Product page", hint: "For your store", tag: "Store", path: "longDescription", v: d.longDescription ?? "" },
          ].map((x) => (
            <DocBlock key={x.k} label={x.tag}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-semibold">{x.k}</span>
                    <span className="text-xs text-muted-foreground">
                      {x.hint} · {wordCount(x.v)} words
                    </span>
                  </div>
                  <CopyBtn text={x.v} label="Copy" />
                </div>
                <EditableText label={x.k} value={x.v} onSave={(v) => onEdit(x.path, v)} className={cn(lead, "whitespace-pre-line")} />
              </div>
            </DocBlock>
          ))}
        </div>
      ),
    },
    {
      id: "pillars",
      title: "Message pillars",
      render: () => (
        <>
          <Hint>The three things every video and ad should prove.</Hint>
          {arr(d.pillars).map((p, i) => (
            <DocBlock key={i} label={`0${i + 1}`}>
              <div className="flex flex-col gap-2">
                <EditableText label="pillar title" singleLine value={p.title} onSave={(v) => v && onEdit(`pillars.${i}.title`, v)} className={big} />
                <EditableText label="pillar line" value={p.line} onSave={(v) => onEdit(`pillars.${i}.line`, v)} className={lead} />
                <span className={cn(label, "mt-2")}>Show it by</span>
                <ul className="flex flex-col gap-1.5">
                  {arr(p.proof).map((x, k) => (
                    <li key={k} className="flex gap-2.5">
                      <span className="mt-[0.7rem] size-1 shrink-0 rounded-full bg-foreground/40" />
                      <EditableText label="proof" value={x} onSave={(v) => onEdit(`pillars.${i}.proof.${k}`, v)} className="min-w-0 flex-1 text-[1rem] text-muted-foreground" />
                    </li>
                  ))}
                </ul>
              </div>
            </DocBlock>
          ))}
        </>
      ),
    },
    {
      id: "buyers",
      title: "Buyers",
      render: () => (
        <>
          <Hint>Who buys it, what bugs them, and the line that speaks to them.</Hint>
          {arr(d.personas).map((p, i) => (
            <DocBlock key={i} label={`0${i + 1}`}>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className={big}>{p.name}</span>
                  <EditableText label="who" value={p.who} onSave={(v) => onEdit(`personas.${i}.who`, v)} className="text-muted-foreground" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className={label}>Their problem</span>
                    <EditableText label="problem" value={p.pain} onSave={(v) => onEdit(`personas.${i}.pain`, v)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={label}>What we promise</span>
                    <EditableText label="promise" value={p.promise} onSave={(v) => onEdit(`personas.${i}.promise`, v)} />
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-2xl bg-secondary/60 p-4">
                  <EditableText label="ad line" value={p.line} onSave={(v) => onEdit(`personas.${i}.line`, v)} className="min-w-0 flex-1 text-[1.05rem] font-medium" />
                  <CopyBtn text={p.line} />
                </div>
              </div>
            </DocBlock>
          ))}
        </>
      ),
    },
    {
      id: "doubts",
      title: "Doubts buyers will have",
      render: () => (
        <>
          <Hint>Answer these in captions, comments and your FAQ.</Hint>
          {arr(d.objections).map((o, i) => (
            <DocBlock key={i} label={`Q${i + 1}`}>
              <div className="flex flex-col gap-1.5">
                <EditableText label="question" value={o.q} onSave={(v) => v && onEdit(`objections.${i}.q`, v)} className="text-[1.12rem] font-semibold" />
                <EditableText label="answer" value={o.a} onSave={(v) => onEdit(`objections.${i}.a`, v)} className={lead} />
              </div>
            </DocBlock>
          ))}
        </>
      ),
    },
    {
      id: "stand-apart",
      title: "How to stand apart",
      render: () => (
        <div className={cn("flex flex-col gap-2", gutter)}>
          <span className={label}>Compared with your competitors&apos; ads</span>
          <EditableText label="difference" value={d.difference ?? ""} onSave={(v) => onEdit("difference", v)} className={lead} />
        </div>
      ),
    },
  ];
  return <Chapters base="/lab/positioning" chapters={chapters} chapter={chapter} onChapter={onChapter} />;
}

// ------------------------------------------------------------------ branding

const fontOk = (f?: string) => !!f && /^[A-Za-z0-9 ]{2,40}$/.test(f.trim());

export function BrandingView({ d, brand, chapter, onChapter, onEdit }: ViewProps<Branding> & { brand: string }) {
  const heading = fontOk(d.type?.heading) ? d.type.heading.trim() : null;
  const body = fontOk(d.type?.body) ? d.type.body.trim() : null;
  const fonts = [...new Set([heading, body].filter((f): f is string => !!f))].map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`);
  const palette = arr(d.palette).map((c) => ({ ...c, hex: /^#[0-9a-f]{6}$/i.test(c.hex ?? "") ? c.hex : "#cccccc" }));
  const cols = { "--n": palette.length || 1 } as React.CSSProperties;
  const chapters: Chapter[] = [
    {
      id: "personality",
      title: "Personality",
      render: () => (
        <>
          {arr(d.personality).map((p, i) => (
            <DocBlock key={i} label={`0${i + 1}`}>
              <div className="flex flex-col gap-1">
                <span className="text-[1.5rem] font-semibold tracking-[-0.02em]">{p.trait}</span>
                <EditableText label="what it means" value={p.means} onSave={(v) => onEdit(`personality.${i}.means`, v)} className={lead} />
              </div>
            </DocBlock>
          ))}
        </>
      ),
    },
    {
      id: "colours",
      title: "Colour palette",
      render: () => (
        <>
          <Hint>Click a colour to copy its hex code.</Hint>
          <div className={gutter}>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="grid h-36 grid-cols-[repeat(var(--n),minmax(0,1fr))] sm:h-44" style={cols}>
                {palette.map((c, i) => (
                  <Swatch key={i} c={c} />
                ))}
              </div>
              <div className="grid divide-y sm:grid-cols-[repeat(var(--n),minmax(0,1fr))] sm:divide-x sm:divide-y-0" style={cols}>
                {palette.map((c, i) => (
                  <div key={i} className="flex flex-col gap-0.5 p-4">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <span className="font-mono text-[0.7rem] text-muted-foreground">{c.hex.toUpperCase()}</span>
                    <EditableText label="colour use" value={c.use} onSave={(v) => onEdit(`palette.${i}.use`, v)} className="mt-1 text-xs leading-snug text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      id: "typography",
      title: "Typography",
      render: () => (
        <div className={cn("flex flex-col gap-6", gutter)}>
          {/* Load the suggested Google Fonts so the specimen shows them for real. */}
          {fonts.length > 0 && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${fonts.join("&")}&display=swap`} />}
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-6 sm:p-8">
            <p className="text-[2.8rem] leading-[0.95] font-bold tracking-[-0.02em] sm:text-[3.4rem]" style={{ fontFamily: heading ? `'${heading}', sans-serif` : undefined }}>
              {brand}
            </p>
            <p className="max-w-lg text-[1.05rem] leading-relaxed" style={{ fontFamily: body ? `'${body}', sans-serif` : undefined }}>
              One shoe for the walk to class, the gym after, and the long way home.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <span className={label}>Headings</span>
              <span className="text-lg font-semibold">{d.type?.heading}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={label}>Body</span>
              <span className="text-lg font-semibold">{d.type?.body}</span>
            </div>
          </div>
          {d.type?.why && <EditableText label="why these fonts" value={d.type.why} onSave={(v) => onEdit("type.why", v)} className="text-muted-foreground" />}
        </div>
      ),
    },
    {
      id: "words",
      title: "Words to use and avoid",
      render: () => (
        <>
          <DocBlock label="Use">
            <div className="flex flex-wrap gap-1.5">
              {arr(d.wordsUse).map((w) => (
                <Chip key={w} tone="ok" className="h-8 px-3.5 text-[0.88rem]">
                  {w}
                </Chip>
              ))}
            </div>
          </DocBlock>
          <DocBlock label="Avoid">
            <div className="flex flex-wrap gap-1.5">
              {arr(d.wordsAvoid).map((w) => (
                <Chip key={w} className="h-8 px-3.5 text-[0.88rem] text-muted-foreground line-through">
                  {w}
                </Chip>
              ))}
            </div>
          </DocBlock>
        </>
      ),
    },
    {
      id: "voice",
      title: "Voice",
      render: () => (
        <>
          {[
            { k: "Do", key: "voiceDo", v: arr(d.voiceDo), ok: true },
            { k: "Never", key: "voiceDont", v: arr(d.voiceDont), ok: false },
          ].map((x) => (
            <DocBlock key={x.k} label={x.k}>
              <ul className="flex flex-col gap-3">
                {x.v.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={cn("mt-1 grid size-5 shrink-0 place-items-center rounded-full", x.ok ? "bg-ok-soft text-ok" : "bg-secondary text-muted-foreground")}>
                      {x.ok ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                    <EditableText label="voice rule" value={r} onSave={(v) => onEdit(`${x.key}.${i}`, v)} className="min-w-0 flex-1 text-[1.02rem]" />
                  </li>
                ))}
              </ul>
            </DocBlock>
          ))}
        </>
      ),
    },
    {
      id: "names",
      title: "Shoe name ideas",
      render: () => (
        <>
          <Hint>Names for your first model.</Hint>
          {arr(d.modelNames).map((m, i) => (
            <DocBlock key={i} label={`0${i + 1}`}>
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={big}>{m.name.toLowerCase().startsWith(brand.toLowerCase()) ? m.name : `${brand} ${m.name}`}</span>
                  <EditableText label="why this name" value={m.why} onSave={(v) => onEdit(`modelNames.${i}.why`, v)} className="text-muted-foreground" />
                </div>
                <CopyBtn text={m.name} />
              </div>
            </DocBlock>
          ))}
        </>
      ),
    },
    {
      id: "logo",
      title: "Logo concepts",
      render: () => (
        <>
          <Hint>Brief a designer with these.</Hint>
          {arr(d.logoIdeas).map((l, i) => (
            <DocBlock key={i} label={String.fromCharCode(65 + i)}>
              <div className="flex flex-col gap-1">
                <span className="text-[1.2rem] font-semibold">{l.name}</span>
                <EditableText label="logo concept" value={l.concept} onSave={(v) => onEdit(`logoIdeas.${i}.concept`, v)} className={lead} />
              </div>
            </DocBlock>
          ))}
        </>
      ),
    },
    {
      id: "photo",
      title: "Photo and video direction",
      render: () => (
        <>
          {arr(d.photography).map((r, i) => (
            <DocBlock key={i} label={`0${i + 1}`}>
              <EditableText label="direction" value={r} onSave={(v) => onEdit(`photography.${i}`, v)} className="text-[1.05rem] leading-relaxed" />
            </DocBlock>
          ))}
        </>
      ),
    },
  ];
  return <Chapters base="/lab/branding" chapters={chapters} chapter={chapter} onChapter={onChapter} />;
}

function Swatch({ c }: { c: { name: string; hex: string } }) {
  const [done, copy] = useCopy();
  const n = parseInt(c.hex.slice(1), 16);
  const light = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
  return (
    <button
      onClick={() => copy(c.hex)}
      style={{ background: c.hex }}
      className={cn("group/sw flex items-end p-3 text-left font-mono text-[0.7rem]", light ? "text-black/70 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]" : "text-white/85")}
      title={`Copy ${c.hex}`}
    >
      <span className={cn("transition-opacity", done ? "opacity-100" : "opacity-0 group-hover/sw:opacity-100")}>{done ? "Copied" : c.hex.toUpperCase()}</span>
    </button>
  );
}

// ------------------------------------------------------------------ ideas & remix

function Refs({ refs, sources }: { refs: string[]; sources: StudioSource[] }) {
  const panel = useAdPanel();
  const list = refs.map((r) => sources.find((s) => s.ref === r)).filter((s): s is StudioSource => !!s && !!s.thumbnail_url);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.map((s) => (
        <button
          key={s.ref}
          onClick={() => panel.open(s.id, list.map((x) => ({ id: x.id, thumbnail_url: x.thumbnail_url })))}
          title={`${s.brand} · running ${s.days ?? "?"} days`}
          className="flex items-center gap-2 rounded-full bg-secondary py-1 pr-3 pl-1 text-sm transition-colors hover:bg-secondary/70"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.thumbnail_url!} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full object-cover" />
          {s.brand}
          {s.days != null && <span className="text-muted-foreground">{s.days} days</span>}
        </button>
      ))}
    </div>
  );
}

/** Removes evidence refs like "[A3]" or "(A3, A7)" and the words they leave dangling ("borrowed from."). */
const stripRefs = (s: string) =>
  s
    .replace(/\s*[[(]?\bA\d+\b(?:\s*(?:,|and)\s*\bA\d+\b)*[\])]?/g, "")
    .replace(/\s+\b(?:from|in|like|of|by|to|with)\b\s*(?=[.,;:!?]|$)/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export function IdeasView({ d, sources, chapter, onChapter, onEdit }: ViewProps<Ideas> & { sources: StudioSource[] }) {
  const chapters: Chapter[] = arr(d.concepts).map((c, i) => ({
    id: String(i + 1),
    title: c.title,
    hint: c.format,
    render: () => (
      <>
        <div className={cn("-mt-2 flex flex-wrap items-center gap-1.5", gutter)}>
          <Chip tone="ink">{c.format}</Chip>
          <CopyBtn text={`${c.title} (${c.format})\nHook: ${c.hook}\n${arr(c.beats).map((b, k) => `${k + 1}. ${beat(b)}`).join("\n")}\nWhy: ${stripRefs(c.why ?? "")}`} label="Copy" />
        </div>
        <DocBlock label="Hook">
          <EditableText label="hook" value={c.hook} onSave={(v) => v && onEdit(`concepts.${i}.hook`, v)} className={big} />
        </DocBlock>
        {arr(c.beats).map((b, k) => (
          <DocBlock key={k} label={`Beat ${k + 1}`}>
            <EditableText label="beat" value={beat(b)} onSave={(v) => onEdit(`concepts.${i}.beats.${k}`, v)} className="text-[1.05rem] leading-relaxed" />
          </DocBlock>
        ))}
        <DocBlock label="Why">
          <EditableText label="why it works" value={stripRefs(c.why ?? "")} onSave={(v) => onEdit(`concepts.${i}.why`, v)} className="leading-relaxed text-muted-foreground" />
        </DocBlock>
        {arr(c.inspiredBy).length > 0 && (
          <DocBlock label="From">
            <Refs refs={arr(c.inspiredBy)} sources={sources} />
          </DocBlock>
        )}
      </>
    ),
  }));
  return <Chapters base="/lab/ideas" chapters={chapters} chapter={chapter} onChapter={onChapter} />;
}

export function RemixView({ d, sources, adId, chapter, onChapter, onEdit }: ViewProps<Remix> & { sources: StudioSource[]; adId: string }) {
  const panel = useAdPanel();
  const original = sources[0];
  const chapters: Chapter[] = [
    {
      id: "original",
      title: original?.brand ? `${original.brand}'s original ad` : "The original ad",
      render: () => (
        <div className={cn("flex flex-col gap-5", gutter)}>
          {original && (
            <button onClick={() => panel.open(original.id, [{ id: original.id, thumbnail_url: original.thumbnail_url }])} className="flex w-fit items-center gap-4 rounded-2xl border bg-card p-3 pr-5 text-left transition-colors hover:border-foreground/20">
              {original.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={original.thumbnail_url} alt="" referrerPolicy="no-referrer" className="h-28 w-auto rounded-xl" />
              )}
              <span className="text-sm text-muted-foreground">Open the ad</span>
            </button>
          )}
          <span className={label}>Why it works</span>
          <EditableText label="why the original works" value={d.original ?? ""} onSave={(v) => onEdit("original", v)} className={lead} />
        </div>
      ),
    },
    ...arr(d.versions).map((v, i) => ({
      id: `v${i + 1}`,
      title: v.angle,
      render: () => (
        <>
          <div className={cn("-mt-2", gutter)}>
            <CopyBtn text={`${v.hook}\n${arr(v.beats).map((b, k) => `${k + 1}. ${beat(b)}`).join("\n")}\n\n${v.copy}`} label="Copy" />
          </div>
          <DocBlock label="Hook">
            <EditableText label="hook" value={v.hook} onSave={(x) => x && onEdit(`versions.${i}.hook`, x)} className={big} />
          </DocBlock>
          {arr(v.beats).map((b, k) => (
            <DocBlock key={k} label={`Beat ${k + 1}`}>
              <EditableText label="beat" value={beat(b)} onSave={(x) => onEdit(`versions.${i}.beats.${k}`, x)} className="text-[1.05rem] leading-relaxed" />
            </DocBlock>
          ))}
          <DocBlock label="Copy">
            <div className="rounded-2xl bg-secondary/60 p-4">
              <EditableText label="ad copy" value={v.copy} onSave={(x) => onEdit(`versions.${i}.copy`, x)} className="text-[1.02rem] leading-relaxed" />
            </div>
          </DocBlock>
        </>
      ),
    })),
  ];
  return <Chapters base={`/lab/remix/${adId}`} chapters={chapters} chapter={chapter} onChapter={onChapter} />;
}
