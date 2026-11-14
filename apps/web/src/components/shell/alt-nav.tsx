"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NAV, NAV_FOOTER } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Navigation for the interface styles that don't use the sidebar. All of them render on every page and
 * ui-themes.css shows the one the active style uses, so switching style never reloads or flashes.
 */
const ITEMS = [...NAV, ...NAV_FOOTER];
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Studio: a slim icon rail with tooltips, like a design tool. */
export function Rail() {
  const pathname = usePathname();
  return (
    <aside className="ui-rail sticky top-0 h-dvh w-14 shrink-0 flex-col items-center gap-1 border-r bg-surface py-3">
      <Link href="/discover" aria-label="Atria" className="mb-3 grid size-9 place-items-center overflow-hidden rounded-md">
        <span className="scale-75">
          <Logo />
        </span>
      </Link>
      {NAV.map((n) => (
        <RailItem key={n.href} href={n.href} label={n.label} icon={n.icon} on={isActive(pathname, n.href)} />
      ))}
      <span className="flex-1" />
      {NAV_FOOTER.map((n) => (
        <RailItem key={n.href} href={n.href} label={n.label} icon={n.icon} on={isActive(pathname, n.href)} />
      ))}
    </aside>
  );
}

function RailItem({ href, label, icon: Icon, on }: { href: string; label: string; icon: (typeof NAV)[number]["icon"]; on: boolean }) {
  return (
    <Link href={href} aria-label={label} aria-current={on ? "page" : undefined} className="group/r relative grid size-10 place-items-center rounded-md">
      {on && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-md bg-pink-soft" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
      {on && <span className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-r bg-pink" />}
      <Icon className={cn("relative size-[1.15rem] transition-colors", on ? "text-pink-ink" : "text-muted-foreground group-hover/r:text-foreground")} />
      <span className="pointer-events-none absolute left-full z-50 ml-2 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-ink-foreground opacity-0 shadow-[var(--shadow-lift)] transition-opacity group-hover/r:opacity-100">
        {label}
      </span>
    </Link>
  );
}

/** Gallery: a quiet museum header. Wordmark left, small uppercase text links, a thin rule under the page. */
export function GalleryNav() {
  const pathname = usePathname();
  return (
    <header className="ui-gallerynav border-b">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-8 px-4 py-5 sm:px-6 lg:px-10">
        <Link href="/discover" aria-label="Atria" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="no-scrollbar flex flex-1 items-center justify-center gap-7 overflow-x-auto">
          {ITEMS.map((n) => {
            const on = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative shrink-0 py-1 text-[0.72rem] font-medium tracking-[0.16em] uppercase transition-colors", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {n.label}
                {on && <motion.span layoutId="gallery-dot" className="absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-pink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle className="hidden w-[6.5rem] shrink-0 md:grid" />
      </div>
    </header>
  );
}

/** Bento: a floating pill of chunky icon-and-label buttons; the current page sits on a colour tile. */
export function PillNav() {
  const pathname = usePathname();
  return (
    <div className="ui-pillnav sticky top-3 z-40 justify-center px-3 pt-3">
      <nav aria-label="Main" className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-[1.6rem] border bg-card p-1.5 shadow-[var(--shadow-lift)]">
        <Link href="/discover" aria-label="Atria" className="mr-1 grid h-10 shrink-0 place-items-center rounded-[1.1rem] bg-ink px-3">
          <span className="text-sm font-bold text-ink-foreground">atria</span>
        </Link>
        {ITEMS.map((n, i) => {
          const on = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className="relative flex h-10 shrink-0 items-center gap-2 rounded-[1.1rem] px-3.5 text-sm font-semibold">
              {on && <motion.span layoutId="pill-active" className="absolute inset-0 rounded-[1.1rem]" style={{ background: `var(--tile-${(i % 6) + 1})` }} transition={{ type: "spring", stiffness: 480, damping: 34 }} />}
              <Icon className={cn("relative size-4", on ? "text-foreground" : "text-muted-foreground")} />
              <span className={cn("relative", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Feed: an app bar with big icon tabs in the middle and an underline on the current one. */
export function AppBar() {
  const pathname = usePathname();
  return (
    <header className="ui-appbar sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-stretch gap-4 px-4 sm:px-6">
        <Link href="/discover" aria-label="Atria" className="flex shrink-0 items-center">
          <Logo />
        </Link>
        <nav aria-label="Main" className="no-scrollbar flex flex-1 items-stretch justify-center overflow-x-auto">
          {ITEMS.map((n) => {
            const on = isActive(pathname, n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} title={n.label} className="group/a relative flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 sm:w-24">
                <span className="grid h-9 w-full place-items-center rounded-lg transition-colors group-hover/a:bg-secondary">
                  <Icon className={cn("size-[1.35rem]", on ? "text-pink" : "text-muted-foreground")} />
                </span>
                <span className={cn("hidden text-[0.62rem] font-semibold sm:block", on ? "text-foreground" : "text-muted-foreground")}>{n.label}</span>
                {on && <motion.span layoutId="appbar-line" className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-pink" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle className="hidden w-[6.5rem] shrink-0 self-center md:grid" />
      </div>
    </header>
  );
}
