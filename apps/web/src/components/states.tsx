import { AlertTriangle, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/page-header";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  phase,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  phase?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-[24px] border bg-card px-6 py-16 text-center", className)}>
      <div className="grid size-12 place-items-center rounded-2xl bg-secondary">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      {phase !== undefined && <Chip tone="pink">Phase {phase}</Chip>}
      <div className="flex max-w-md flex-col gap-2">
        <h3 className="font-display text-xl font-semibold tracking-[-0.03em]">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load this", reason, className }: { title?: string; reason: string; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground">{reason}</span>
      </div>
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-xl", className)} />;
}
