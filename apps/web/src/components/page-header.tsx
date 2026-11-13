import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("stagger flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow && <div className="eyebrow flex items-center gap-2">{eyebrow}</div>}
        <h1 className="font-display display-tight text-[2.15rem] font-semibold sm:text-[2.75rem]">{title}</h1>
        {description && <p className="max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small mono chip, Atria-style. `tone="live"` adds a pulsing lime dot. */
export function Chip({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "live" | "pink" | "warn" | "ok" | "danger"; className?: string }) {
  const tones = {
    neutral: "border bg-card text-muted-foreground",
    live: "bg-lime text-lime-ink",
    pink: "bg-pink-soft text-pink-ink",
    warn: "bg-warn-soft text-warn",
    ok: "bg-ok-soft text-ok",
    danger: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-[0.68rem] leading-none font-medium tracking-wide", tones[tone], className)}>
      {tone === "live" && <span className="size-1.5 animate-live rounded-full bg-lime-ink" />}
      {children}
    </span>
  );
}
