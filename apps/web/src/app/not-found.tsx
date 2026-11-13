import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { PillButton } from "@/components/ui/pill-button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <LogoMark className="size-12 animate-enter" />
      <h1 className="font-display display-tight animate-enter text-5xl font-semibold [animation-delay:80ms]">Nothing here.</h1>
      <p className="animate-enter text-muted-foreground [animation-delay:140ms]">That page doesn&apos;t exist.</p>
      <PillButton asChild className="animate-enter [animation-delay:200ms]">
        <Link href="/discover">Back to Discover</Link>
      </PillButton>
    </main>
  );
}
