"use client";

import { RotateCcw } from "lucide-react";
import { PillButton } from "@/components/ui/pill-button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
      <span className="eyebrow">Something broke</span>
      <h1 className="font-display display-tight text-3xl font-semibold">This page hit an error.</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <PillButton variant="ink" onClick={() => retry()} icon={<RotateCcw className="size-4" />}>
        Try again
      </PillButton>
    </div>
  );
}
