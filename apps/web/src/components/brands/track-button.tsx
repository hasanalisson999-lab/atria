"use client";

import { Check, EyeOff, Plus, Undo2 } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setBrandStatus } from "@/app/actions";
import { cn } from "@/lib/utils";

type Status = "tracked" | "discovered" | "ignored";

/** Track / Untrack toggle with optimistic state and an animated check. */
export function TrackButton({ brandId, status, className, size = "md" }: { brandId: string; status: Status; className?: string; size?: "sm" | "md" }) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, start] = useTransition();
  const tracked = optimistic === "tracked";

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next: Status = tracked ? "discovered" : "tracked";
    start(async () => {
      setOptimistic(next);
      const r = await setBrandStatus(brandId, next);
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={tracked}
      className={cn(
        "relative z-[2] inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-300 ease-[var(--ease-out-quart)] active:scale-95",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        tracked ? "bg-ink text-ink-foreground" : "border bg-card hover:border-foreground/25 hover:shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <span className="relative grid size-3.5 place-items-center">
        <Plus className={cn("absolute size-3.5 transition-all duration-300", tracked ? "scale-0 rotate-90 opacity-0" : "scale-100 opacity-100")} />
        <Check className={cn("absolute size-3.5 text-pink transition-all duration-300", tracked ? "scale-100 opacity-100" : "scale-0 -rotate-90 opacity-0")} />
      </span>
      {tracked ? "Tracking" : "Track"}
    </button>
  );
}

export function IgnoreButton({ brandId, status, className }: { brandId: string; status: Status; className?: string }) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, start] = useTransition();
  const ignored = optimistic === "ignored";
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const next: Status = ignored ? "discovered" : "ignored";
          setOptimistic(next);
          const r = await setBrandStatus(brandId, next);
          if (r.ok) toast.success(r.message ?? "Saved");
          else toast.error(r.error);
        });
      }}
      disabled={pending}
      title={ignored ? "Restore brand" : "Hide this brand everywhere"}
      className={cn("relative z-[2] grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground", className)}
    >
      {ignored ? <Undo2 className="size-3.5" /> : <EyeOff className="size-3.5" />}
    </button>
  );
}
