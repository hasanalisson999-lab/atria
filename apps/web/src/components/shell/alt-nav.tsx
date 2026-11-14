"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NAV, NAV_FOOTER } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Navigation for the interface styles that don't use the sidebar. All render on every page; ui-themes.css
 * shows only the one the active style uses, so switching style never reloads.
 */
const ITEMS = [...NAV, ...NAV_FOOTER];
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Cinema: a black top bar that fades into the page, bold text links, an amber line under the current one. */
export function CinemaBar() {
  const pathname = usePathname();
  return (
    <header className="ui-cinemabar sticky top-0 z-40 bg-gradient-to-b from-black via-black/90 to-black/0 pb-3">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-8 px-4 sm:px-6 lg:px-10">
        <Link href="/discover" aria-label="Atria" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="no-scrollbar flex flex-1 items-center gap-6 overflow-x-auto">
          {ITEMS.map((n) => {
            const on = isActive(pathname, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cn("relative shrink-0 py-1 text-sm font-semibold transition-colors", on ? "text-white" : "text-white/55 hover:text-white")}>
                {n.label}
                {on && <motion.span layoutId="cinema-line" className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-pink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/** Ledger: a slim icon rail with tooltips, like a research tool. */
export function Rail() {
  const pathname = usePathname();
  return (
    <aside className="ui-rail sticky top-0 h-dvh w-14 shrink-0 flex-col items-center gap-1 border-r bg-surface py-3">
      <Link href="/discover" aria-label="Atria" className="mb-3 grid size-9 place-items-center overflow-hidden">
        <span className="scale-75">
          <Logo />
        </span>
      </Link>
      {NAV.map((n) => (
        <RailItem key={n.href} item={n} on={isActive(pathname, n.href)} />
      ))}
      <span className="flex-1" />
      {NAV_FOOTER.map((n) => (
        <RailItem key={n.href} item={n} on={isActive(pathname, n.href)} />
      ))}
    </aside>
  );
}

function RailItem({ item, on }: { item: (typeof NAV)[number]; on: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-label={item.label} aria-current={on ? "page" : undefined} className="group/r relative grid size-10 place-items-center rounded-md">
      {on && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-md bg-pink-soft" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
      <Icon className={cn("relative size-[1.15rem]", on ? "text-pink-ink" : "text-muted-foreground group-hover/r:text-foreground")} />
      <span className="pointer-events-none absolute left-full z-50 ml-2 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-ink-foreground opacity-0 shadow-[var(--shadow-lift)] transition-opacity group-hover/r:opacity-100">
        {item.label}
      </span>
    </Link>
  );
}

/** Pop: a chunky sticker pill floating at the top; the current page is hot pink. */
export function PopNav() {
  const pathname = usePathname();
  return (
    <div className="ui-popnav sticky top-3 z-40 justify-center px-3 pt-3">
      <nav aria-label="Main" className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full border-2 border-foreground bg-card p-1.5 shadow-[4px_4px_0_0_var(--foreground)]">
        <Link href="/discover" aria-label="Atria" className="mr-1 grid h-9 shrink-0 place-items-center rounded-full bg-lime px-3.5 text-sm font-black text-lime-ink">
          atria
        </Link>
        {ITEMS.map((n) => {
          const on = isActive(pathname, n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className="relative flex h-9 shrink-0 items-center px-3.5 text-sm font-bold">
              {on && <motion.span layoutId="pop-active" className="absolute inset-0 rounded-full bg-pink" transition={{ type: "spring", stiffness: 480, damping: 32 }} />}
              <span className={cn("relative", on ? "text-black" : "text-foreground/70 hover:text-foreground")}>{n.label}</span>
            </Link>
          );
        })}
        <ThemeToggle className="ml-1 hidden w-[6.5rem] shrink-0 md:grid" />
      </nav>
    </div>
  );
}
