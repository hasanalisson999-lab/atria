"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NAV, NAV_FOOTER } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Navigation for the interface styles that don't use the sidebar (see ui-themes.css for which style shows
 * which). Both render on every page; CSS picks the one the active style uses, so switching never reloads.
 */
const ITEMS = [...NAV, ...NAV_FOOTER];
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Masthead (Paper and Brutal): wordmark and a horizontal nav across the top.
 * Paper: an editorial masthead with underlined links. Brutal: a black bar of uppercase blocks.
 */
export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="ui-topnav border-b bg-background in-data-[ui=brutal]:border-b-2 in-data-[ui=brutal]:bg-foreground in-data-[ui=brutal]:text-background">
      <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 sm:px-6 lg:px-10">
        <Link href="/discover" className="flex shrink-0 items-center py-4 in-data-[ui=paper]:py-5" aria-label="Atria">
          <Logo />
        </Link>
        <nav aria-label="Main" className="no-scrollbar -mb-px flex flex-1 items-stretch gap-1 overflow-x-auto in-data-[ui=paper]:justify-center in-data-[ui=paper]:gap-7">
          {ITEMS.map((n) => {
            const on = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center text-sm transition-colors",
                  // Paper: quiet links with an underline under the current page.
                  "in-data-[ui=paper]:py-5 in-data-[ui=paper]:text-[0.95rem]",
                  on ? "in-data-[ui=paper]:text-foreground" : "in-data-[ui=paper]:text-muted-foreground in-data-[ui=paper]:hover:text-foreground",
                  // Brutal: solid uppercase blocks; the current page is electric yellow.
                  "in-data-[ui=brutal]:my-2 in-data-[ui=brutal]:px-3.5 in-data-[ui=brutal]:py-2 in-data-[ui=brutal]:text-[0.78rem] in-data-[ui=brutal]:font-bold in-data-[ui=brutal]:tracking-[0.06em] in-data-[ui=brutal]:uppercase",
                  on ? "in-data-[ui=brutal]:bg-pink in-data-[ui=brutal]:text-black" : "in-data-[ui=brutal]:hover:bg-background in-data-[ui=brutal]:hover:text-foreground",
                )}
              >
                {n.label}
                {on && <motion.span layoutId="topnav-underline" className="absolute inset-x-0 bottom-0 hidden h-[2px] bg-foreground in-data-[ui=paper]:block" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle className="hidden w-[6.5rem] shrink-0 md:grid in-data-[ui=brutal]:border-background" />
      </div>
    </header>
  );
}

/** Dock (Glass): a floating, frosted bar of icons at the bottom of the screen, labels under the icons. */
export function Dock() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="ui-dock fixed inset-x-0 bottom-4 z-40 justify-center px-3">
      <div className="flex items-end gap-1 rounded-[1.6rem] border bg-card/70 p-1.5 shadow-[var(--shadow-lift)] backdrop-blur-2xl">
        {ITEMS.map((n) => {
          const on = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className="group/d relative flex w-[4.25rem] flex-col items-center gap-1 rounded-[1.2rem] px-1 pt-2 pb-1.5 text-[0.66rem] font-medium">
              {on && <motion.span layoutId="dock-active" className="absolute inset-0 rounded-[1.2rem] bg-foreground/[0.08]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <motion.span whileHover={{ y: -4, scale: 1.12 }} whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 420, damping: 20 }} className="relative">
                <Icon className={cn("size-[1.35rem]", on ? "text-pink-ink dark:text-pink" : "text-muted-foreground group-hover/d:text-foreground")} />
              </motion.span>
              <span className={cn("relative truncate", on ? "text-foreground" : "text-muted-foreground")}>{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
