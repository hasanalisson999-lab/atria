"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { GlobalSearch } from "@/components/shell/global-search";
import { SettingsLink, SidebarNav } from "@/components/shell/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const GOTO: Record<string, string> = { d: "/discover", b: "/brands", o: "/boards", t: "/tracking", s: "/settings" };

/** Top bar: live search ("/" to focus) + "g then d/b/o/t/s" navigation shortcuts. */
export function Topbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))) return;
      if (e.key === "g") {
        gAt = Date.now();
        return;
      }
      const dest = GOTO[e.key];
      if (dest && Date.now() - gAt < 900) {
        gAt = 0;
        router.push(dest);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <header className="ui-topbar sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden" aria-label="Open navigation">
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col gap-6 bg-surface p-4">
            <SheetHeader className="p-0">
              <SheetTitle asChild>
                <Link href="/discover" onClick={() => setOpen(false)}>
                  <Logo />
                </Link>
              </SheetTitle>
            </SheetHeader>
            <SidebarNav idPrefix="mobile" onNavigate={() => setOpen(false)} />
            <div className="flex items-center justify-between border-t pt-4">
              <ThemeToggle className="w-[6.5rem]" />
              <SettingsLink onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <Link href="/discover" className="shrink-0 lg:hidden">
          <Logo collapsed />
        </Link>
        <GlobalSearch />
      </div>
    </header>
  );
}
