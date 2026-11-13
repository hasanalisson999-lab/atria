import { cn } from "@/lib/utils";

/** Wing path shared by the logo and the favicon (viewBox 0 0 100 100). */
export const WING_PATH =
  "M27 9.5Q31 4.5 37 8.5L93 60Q98.5 65.5 93.5 71.5L81.5 87Q78.5 91 73.5 91H49Q41.5 91 36 85.5L8 47.5Q4.5 41.5 11 39.5Q14 38.8 17 40.2L45 54.5L25.5 18Q23.5 13 27 9.5Z";
export const SPARKLE_PATH = "M75 63Q76.2 72.8 86 74Q76.2 75.2 75 85Q73.8 75.2 64 74Q73.8 72.8 75 63Z";

/** Atria mark: orange wing with a sparkle, no background (the favicon adds one). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-7", className)}>
      <path d={WING_PATH} fill="#F26A36" />
      <path d={SPARKLE_PATH} fill="#ECEAF2" />
    </svg>
  );
}

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn("group/logo inline-flex items-center gap-2", className)}>
      <LogoMark className="size-8 transition-transform duration-500 ease-[var(--ease-out-quart)] group-hover/logo:-rotate-6 group-hover/logo:scale-105" />
      {!collapsed && <span className="font-display text-[1.15rem] font-semibold tracking-[-0.045em]">Atria</span>}
    </span>
  );
}
