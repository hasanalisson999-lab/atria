import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-background px-4">
      <div aria-hidden className="absolute top-1/4 left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full bg-pink/20 blur-3xl" />
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <Logo />
        <div className="flex w-full flex-col gap-5 rounded-[28px] border bg-card p-7 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.35)]">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.03em]">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Enter your password to open Atria.</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
