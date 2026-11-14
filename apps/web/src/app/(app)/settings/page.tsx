import { Appearance } from "@/components/settings/appearance";
import { CheckCircle2, ChevronDown, CircleDashed, KeyRound, ShieldAlert, XCircle } from "lucide-react";
import { BrandProfileForm } from "@/components/settings/brand-profile-form";
import { getMyBrandDraft } from "@/lib/server/my-brand";
import { DataSources } from "@/components/usage/data-sources";
import { connection } from "next/server";
import { Suspense } from "react";
import { Chip } from "@/components/page-header";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { getEnvStatus, getJobRuns, getOverview, getSpend } from "@/lib/server/data";
import { cn } from "@/lib/utils";
import type { EnvKeyStatus } from "@signal/shared/env";

export const metadata = { title: "Settings" };

const GROUP_LABEL: Record<string, string> = {
  supabase: "Supabase",
  database: "Database",
  r2: "Cloudflare R2",
  apify: "Apify",
  meta: "Meta Ad Library API",
  gemini: "Google Gemini (free tier)",
  llm: "Free LLM fallbacks (Groq · OpenRouter)",
  scrapers: "Ad Library fallbacks",
  anthropic: "Anthropic",
  voyage: "Voyage AI",
  transcription: "Transcription",
  guardrails: "Guardrails",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display display-tight text-[2.2rem] font-semibold sm:text-[2.6rem]">Settings</h1>
        <p className="text-sm text-muted-foreground">Your brand, your data sources, and what&apos;s running behind the scenes.</p>
      </div>
      <Panel title="Appearance" description="Pick the look of the whole app. Change it any day: it switches instantly and is remembered on this device.">
        <Appearance />
      </Panel>
      <Panel title="Your brand" description="Atria personalizes the feed, Tracking, breakdowns and the Brand Lab around this.">
        <Suspense fallback={<SkeletonBlock className="h-64 rounded-2xl" />}>
          <Brand />
        </Suspense>
      </Panel>
      <Panel title="Data sources & AI" description="All free. Atria moves to the next source automatically when one's free allowance is used.">
        <Suspense fallback={<SkeletonBlock className="h-72 rounded-2xl" />}>
          <DataSources />
        </Suspense>
      </Panel>
      <details className="group/adv rounded-[28px] border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5">
          <span className="flex flex-col">
            <span className="font-display text-lg font-semibold tracking-[-0.03em]">Advanced</span>
            <span className="text-sm text-muted-foreground">API keys, spend, background jobs and database. For troubleshooting.</span>
          </span>
          <ChevronDown className="size-5 text-muted-foreground transition-transform group-open/adv:rotate-180" />
        </summary>
        <div className="flex flex-col gap-10 border-t px-6 py-6">
          <Section title="API keys" description="Read from .env on the server. Values are never shown, only whether each key is set.">
            <Suspense fallback={<GridSkeleton />}>
              <KeyStatus />
            </Suspense>
          </Section>
          <Section title="Spend" description="This calendar month (UTC). Everything should stay at $0.">
            <Suspense fallback={<GridSkeleton />}>
              <Spend />
            </Suspense>
          </Section>
          <Section title="Job runs">
            <Suspense fallback={<SkeletonBlock className="h-48" />}>
              <Jobs />
            </Suspense>
          </Section>
          <Section title="Database">
            <Suspense fallback={<SkeletonBlock className="h-16" />}>
              <Database />
            </Suspense>
          </Section>
        </div>
      </details>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 rounded-[28px] border bg-card p-6 sm:p-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

async function Brand() {
  await connection();
  const b = await getMyBrandDraft();
  if (!b) return <p className="text-sm text-muted-foreground">No brand profile found.</p>;
  return <BrandProfileForm initial={{ name: b.name, url: b.url, products: b.products, priceMin: b.priceMin, priceMax: b.priceMax, audience: b.audience, voice: b.voice, offers: b.offers, competitors: b.competitors, keywords: b.keywords }} />;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b pb-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.03em]">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24" />
      ))}
    </div>
  );
}

function stateChip(s: EnvKeyStatus) {
  if (s.state === "configured") return <Chip tone="ok">configured</Chip>;
  if (s.state === "invalid") return <Chip tone="warn">{s.reason ?? "invalid"}</Chip>;
  if (s.optional) return <Chip>optional</Chip>;
  return <Chip tone={s.phase === 0 ? "danger" : "neutral"}>{s.phase === 0 ? "missing" : `needed in P${s.phase}`}</Chip>;
}

async function KeyStatus() {
  await connection();
  const keys = getEnvStatus();
  const groups = [...new Set(keys.map((k) => k.group))];
  return (
    <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => {
        const items = keys.filter((k) => k.group === g);
        const ok = items.every((k) => k.state === "configured" || k.optional);
        return (
          <div key={g} className="card-interactive flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-muted-foreground" />
                {GROUP_LABEL[g] ?? g}
              </span>
              {ok ? <CheckCircle2 className="size-4 text-ok" /> : <CircleDashed className="size-4 text-muted-foreground" />}
            </div>
            <ul className="flex flex-col gap-2">
              {items.map((k) => (
                <li key={k.key} className="flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-[0.72rem] text-muted-foreground" title={k.label}>
                    {k.key}
                  </code>
                  {stateChip(k)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

async function Spend() {
  await connection();
  const spend = await getSpend();
  if (!spend.ok) return <ErrorState title="Spend unavailable" reason={spend.reason} />;
  const exhausted = spend.data.filter((s) => s.spentUsd >= s.budgetUsd);
  const total = spend.data.reduce((a, s) => a + s.spentUsd, 0);
  return (
    <div className="flex flex-col gap-3">
      {exhausted.length > 0 && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <ShieldAlert className="size-4 text-destructive" />
          Budget reached for <strong>{exhausted.map((e) => e.provider).join(", ")}</strong>. Paid calls to these providers are stopped until next month or until you raise the budget.
        </div>
      )}
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tracking-[-0.05em]">${total.toFixed(2)}</span>
        <span className="text-sm text-muted-foreground">spent this month across all providers</span>
      </div>
      <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {spend.data.map((s) => {
          const pct = s.budgetUsd > 0 ? Math.min(100, (s.spentUsd / s.budgetUsd) * 100) : 100;
          return (
            <div key={s.provider} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{s.provider}</span>
                <span className="font-mono text-xs text-muted-foreground">{s.calls} calls</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-xl font-semibold tracking-[-0.04em]">${s.spentUsd.toFixed(s.spentUsd < 1 ? 4 : 2)}</span>
                <span className="text-xs text-muted-foreground">of ${s.budgetUsd.toFixed(0)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full origin-left animate-[grow_900ms_var(--ease-out-quart)_both] rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warn" : "bg-pink")}
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function duration(a: string, b: string | null) {
  if (!b) return "…";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

async function Jobs() {
  await connection();
  const runs = await getJobRuns(25);
  if (!runs.ok) return <ErrorState title="Job history unavailable" reason={runs.reason} />;
  if (!runs.data.length)
    return <EmptyState icon={CircleDashed} title="No job runs yet" description="Start the worker with npm run dev. It runs a health check on boot and every 6 hours." className="py-10" />;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-surface text-left">
              {["Job", "Status", "Started (UTC)", "Duration", "Detail"].map((h) => (
                <th key={h} className="eyebrow px-4 py-2.5 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="stagger">
            {runs.data.map((r) => (
              <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-surface/70">
                <td className="px-4 py-3 font-mono text-xs">{r.job_name}</td>
                <td className="px-4 py-3">
                  {r.status === "succeeded" ? (
                    <Chip tone="ok">succeeded</Chip>
                  ) : r.status === "failed" ? (
                    <Chip tone="danger">
                      <XCircle className="size-3" />
                      failed
                    </Chip>
                  ) : (
                    <Chip tone="live">running</Chip>
                  )}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">{new Date(r.started_at).toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="px-4 py-3 font-mono text-xs">{duration(r.started_at, r.finished_at)}</td>
                <td className="max-w-[28rem] truncate px-4 py-3 text-xs text-muted-foreground" title={r.error ?? JSON.stringify(r.stats)}>
                  {r.error ?? summarize(r.stats)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function summarize(stats: Record<string, unknown>) {
  const checks = stats.checks as Record<string, { ok: boolean; detail?: string }> | undefined;
  if (checks) return Object.entries(checks).map(([k, c]) => `${k} ${c.ok ? "✓" : "✗"}`).join(" · ");
  return Object.entries(stats)
    .filter(([k]) => k !== "ms")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? "…" : String(v)}`)
    .join(" · ");
}

async function Database() {
  await connection();
  const o = await getOverview();
  if (!o.ok) return <ErrorState title="Database not connected" reason={o.reason} />;
  return (
    <div className="flex flex-wrap gap-2">
      {o.data.migrations.map((m) => (
        <Chip key={m} tone="ok">
          {m}
        </Chip>
      ))}
    </div>
  );
}
