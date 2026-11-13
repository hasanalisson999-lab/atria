"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        if (r.ok) {
          const next = params.get("next");
          window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/discover";
        } else {
          setPending(false);
          setError("That password didn't work.");
        }
      }}
      className="flex flex-col gap-3"
    >
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="h-12 rounded-2xl border bg-surface px-4 text-sm outline-none transition-[border-color,box-shadow] focus:border-pink/60 focus:shadow-[0_0_0_4px_var(--pink-soft)]"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button disabled={!password || pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-ink-foreground transition-[transform,opacity] active:scale-[0.98] disabled:opacity-50">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Open Atria
      </button>
    </form>
  );
}
