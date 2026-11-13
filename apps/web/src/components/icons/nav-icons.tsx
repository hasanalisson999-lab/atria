/**
 * Atria's own icon set. Duotone: a soft filled shape (currentColor at low opacity) under a crisp 1.75px
 * stroke. Each icon has one small motion on hover/active (driven by the parent's `group/nav`), so the
 * navigation feels alive without being busy.
 */
import { cn } from "@/lib/utils";

export interface IconProps {
  className?: string;
  strokeWidth?: number;
}

const base = (className?: string) => cn("size-5 shrink-0 overflow-visible", className);
const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Discover: a lens over a spark. The spark twinkles. */
export function DiscoverIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <circle cx="10.5" cy="10.5" r="7" fill="currentColor" opacity="0.14" />
      <circle cx="10.5" cy="10.5" r="7" {...S} strokeWidth={strokeWidth} />
      <path d="m20.5 20.5-4.6-4.6" {...S} strokeWidth={strokeWidth} />
      <path
        d="M10.5 6.8c.35 1.9 1.35 2.9 3.2 3.2-1.85.35-2.85 1.35-3.2 3.2-.35-1.85-1.35-2.85-3.2-3.2 1.85-.3 2.85-1.3 3.2-3.2Z"
        fill="currentColor"
        className="origin-[10.5px_10px] transition-transform duration-500 ease-[var(--ease-out-quart)] group-hover/nav:scale-125 group-hover/nav:rotate-45"
      />
    </svg>
  );
}

/** Brands: a storefront badge. The awning lifts. */
export function BrandsIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <rect x="4" y="9.5" width="16" height="11" rx="2.5" fill="currentColor" opacity="0.14" />
      <path d="M4.5 10v8.5A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2V10" {...S} strokeWidth={strokeWidth} />
      <g className="transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover/nav:-translate-y-0.5">
        <path d="M3.5 7.5 5 3.5h14l1.5 4a2.6 2.6 0 0 1-4.25 2 2.6 2.6 0 0 1-4.25 0 2.6 2.6 0 0 1-4.25 0A2.6 2.6 0 0 1 3.5 7.5Z" {...S} strokeWidth={strokeWidth} />
      </g>
      <path d="M10 20.5v-4.25a2 2 0 0 1 4 0v4.25" {...S} strokeWidth={strokeWidth} />
    </svg>
  );
}

/** Boards: two stacked cards with a bookmark. The back card fans out. */
export function BoardsIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <rect
        x="7.5"
        y="2.5"
        width="13"
        height="15"
        rx="2.5"
        {...S}
        strokeWidth={strokeWidth}
        opacity="0.55"
        className="origin-[14px_17px] transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover/nav:rotate-6"
      />
      <rect x="3.5" y="6.5" width="13" height="15" rx="2.5" fill="currentColor" opacity="0.14" />
      <rect x="3.5" y="6.5" width="13" height="15" rx="2.5" {...S} strokeWidth={strokeWidth} />
      <path d="M7.5 6.5v6l2.5-1.75 2.5 1.75v-6" {...S} strokeWidth={strokeWidth} />
    </svg>
  );
}

/** Tracking: a radar with a blip. The sweep turns. */
export function TrackingIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.14" />
      <circle cx="12" cy="12" r="9" {...S} strokeWidth={strokeWidth} />
      <circle cx="12" cy="12" r="4.5" {...S} strokeWidth={strokeWidth} opacity="0.55" />
      <g className="origin-center transition-transform duration-700 ease-[var(--ease-out-quart)] group-hover/nav:rotate-[120deg]">
        <path d="M12 12 18.4 5.6" {...S} strokeWidth={strokeWidth} />
      </g>
      <circle cx="16.2" cy="14.8" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** AI Studio: a four-point spark with a small companion. Both pulse. */
export function StudioIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <path d="M10 3.5c.7 3.9 2.6 5.8 6.5 6.5-3.9.7-5.8 2.6-6.5 6.5-.7-3.9-2.6-5.8-6.5-6.5 3.9-.7 5.8-2.6 6.5-6.5Z" fill="currentColor" opacity="0.14" />
      <path
        d="M10 3.5c.7 3.9 2.6 5.8 6.5 6.5-3.9.7-5.8 2.6-6.5 6.5-.7-3.9-2.6-5.8-6.5-6.5 3.9-.7 5.8-2.6 6.5-6.5Z"
        {...S}
        strokeWidth={strokeWidth}
        className="origin-[10px_10px] transition-transform duration-500 ease-[var(--ease-out-quart)] group-hover/nav:scale-110"
      />
      <path
        d="M18 14.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"
        fill="currentColor"
        className="origin-[18px_17px] transition-transform delay-75 duration-500 ease-[var(--ease-out-quart)] group-hover/nav:scale-125 group-hover/nav:-rotate-12"
      />
    </svg>
  );
}

/** Settings: soft gear. Turns a quarter on hover. */
export function SettingsIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <g className="origin-center transition-transform duration-500 ease-[var(--ease-out-quart)] group-hover/set:rotate-90 group-hover/nav:rotate-90">
        <path
          d="M10.3 3.4a1.7 1.7 0 0 1 3.4 0l.2 1.2a7.6 7.6 0 0 1 2 1.15l1.15-.43a1.7 1.7 0 0 1 2.1.73 1.7 1.7 0 0 1-.39 2.18l-.95.78a7.7 7.7 0 0 1 0 2.3l.95.78a1.7 1.7 0 0 1 .39 2.18 1.7 1.7 0 0 1-2.1.73l-1.15-.43a7.6 7.6 0 0 1-2 1.15l-.2 1.2a1.7 1.7 0 0 1-3.4 0l-.2-1.2a7.6 7.6 0 0 1-2-1.15l-1.15.43a1.7 1.7 0 0 1-2.1-.73 1.7 1.7 0 0 1 .39-2.18l.95-.78a7.7 7.7 0 0 1 0-2.3l-.95-.78a1.7 1.7 0 0 1-.39-2.18 1.7 1.7 0 0 1 2.1-.73l1.15.43a7.6 7.6 0 0 1 2-1.15Z"
          fill="currentColor"
          opacity="0.14"
          transform="translate(0 2.25)"
        />
        <path
          d="M10.3 3.4a1.7 1.7 0 0 1 3.4 0l.2 1.2a7.6 7.6 0 0 1 2 1.15l1.15-.43a1.7 1.7 0 0 1 2.1.73 1.7 1.7 0 0 1-.39 2.18l-.95.78a7.7 7.7 0 0 1 0 2.3l.95.78a1.7 1.7 0 0 1 .39 2.18 1.7 1.7 0 0 1-2.1.73l-1.15-.43a7.6 7.6 0 0 1-2 1.15l-.2 1.2a1.7 1.7 0 0 1-3.4 0l-.2-1.2a7.6 7.6 0 0 1-2-1.15l-1.15.43a1.7 1.7 0 0 1-2.1-.73 1.7 1.7 0 0 1 .39-2.18l.95-.78a7.7 7.7 0 0 1 0-2.3l-.95-.78a1.7 1.7 0 0 1-.39-2.18 1.7 1.7 0 0 1 2.1-.73l1.15.43a7.6 7.6 0 0 1 2-1.15Z"
          {...S}
          strokeWidth={strokeWidth}
          transform="translate(0 2.25)"
        />
        <circle cx="12" cy="12" r="2.6" {...S} strokeWidth={strokeWidth} />
      </g>
    </svg>
  );
}
