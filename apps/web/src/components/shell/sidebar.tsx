"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useFold } from "@/lib/fold";
import { CURRENT_PHASE, NAV, NAV_FOOTER, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function NavLink({ item, active, onNavigate, layoutId }: { item: NavItem; active: boolean; onNavigate?: () => void; layoutId: string }) {
  const Icon = item.icon;
  const upcoming = item.phase > CURRENT_PHASE + 1;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "group/nav relative flex h-9 items-center gap-3 rounded-lg px-3 in-data-[sidebar=collapsed]:lg:justify-center in-data-[sidebar=collapsed]:lg:px-0 text-sm font-medium text-muted-foreground outline-none transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        active && "text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-lg border bg-card shadow-[var(--shadow-card)]"
          transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
        />
      )}
      <Icon className={cn("relative size-[1.2rem] transition-colors duration-200", active ? "text-pink-ink dark:text-pink" : "text-muted-foreground group-hover/nav:text-foreground")} />
      <span className="relative in-data-[sidebar=collapsed]:lg:sr-only">{item.label}</span>
      {active && <span className="relative ml-auto size-1.5 in-data-[sidebar=collapsed]:lg:hidden rounded-full bg-pink shadow-[0_0_0_3px_var(--pink-soft)]" />}
      {!active && upcoming && <span className="eyebrow relative ml-auto !text-[0.6rem] in-data-[sidebar=collapsed]:lg:hidden opacity-0 transition-opacity group-hover/nav:opacity-100">P{item.phase}</span>}
    </Link>
  );
}

export function SidebarNav({ onNavigate, idPrefix = "desk" }: { onNavigate?: () => void; idPrefix?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const layoutId = `${idPrefix}-nav-active`;

  return (
    <LayoutGroup id={idPrefix}>
      <nav className="flex flex-1 flex-col gap-6" aria-label="Main">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow mb-2 px-3 in-data-[sidebar=collapsed]:lg:invisible">Workspace</span>
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} layoutId={layoutId} />
          ))}
        </div>
      </nav>
    </LayoutGroup>
  );
}

/** Same links without the active state: used while the current path is being resolved. */
function StaticNav() {
  return (
    <nav className="flex flex-1 flex-col gap-6" aria-label="Main">
      <div className="flex flex-col gap-0.5">
        <span className="eyebrow mb-2 px-3 in-data-[sidebar=collapsed]:lg:invisible">Workspace</span>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground">
            <item.icon className="size-[1.2rem]" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Settings as a single gear icon (no label), highlighted when open. */
export function SettingsLink({ onNavigate }: { onNavigate?: () => void }) {
  const item = NAV_FOOTER[0]!;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title="Settings"
      aria-label="Settings"
      className="group/set grid size-9 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      <item.icon className="size-[1.15rem]" />
    </Link>
  );
}

/** The app sidebar. Folds down to icons (button or Ctrl/Cmd+B); the choice is remembered. */
export function Sidebar() {
  const [collapsed, toggle] = useFold("sidebar");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        const t = e.target as HTMLElement | null;
        if (t?.closest("input, textarea, [contenteditable=true]")) return;
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside className="ui-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-hidden border-r bg-surface px-3 py-4 transition-[width] duration-300 ease-[var(--ease-out-quart)] lg:flex in-data-[sidebar=collapsed]:w-[4.25rem]">
      <div className="flex items-center justify-between gap-1 in-data-[sidebar=collapsed]:flex-col in-data-[sidebar=collapsed]:gap-3">
        <Link href="/discover" className="rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 in-data-[sidebar=collapsed]:px-1" aria-label="Atria">
          <Logo collapsed={collapsed} />
        </Link>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Toggle className="size-[1.05rem]" />
        </button>
      </div>
      <Suspense fallback={<StaticNav />}>
        <SidebarNav />
      </Suspense>
      <div className="flex items-center justify-between gap-2 border-t pt-4 in-data-[sidebar=collapsed]:justify-center">
        <ThemeToggle className="w-[6.5rem] in-data-[sidebar=collapsed]:hidden" />
        <SettingsLink />
      </div>
    </aside>
  );
}
