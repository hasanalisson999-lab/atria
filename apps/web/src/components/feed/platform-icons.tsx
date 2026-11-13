import { cn } from "@/lib/utils";

/** Compact monochrome platform marks (FB, IG, Messenger, Audience Network, Threads). */
const ICONS: Record<string, { label: string; path: React.ReactNode }> = {
  facebook: {
    label: "Facebook",
    path: <path d="M14 8.5h2V5.6c-.35-.05-1.55-.15-2.95-.15-2.92 0-4.92 1.84-4.92 5.22V13.5H5v3.25h3.13V24h3.84v-7.25h3.01l.48-3.25h-3.49v-2.53c0-.94.26-1.58 1.6-1.58Z" />,
  },
  instagram: {
    label: "Instagram",
    path: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16.9" cy="7.1" r="1.1" />
      </>
    ),
  },
  messenger: {
    label: "Messenger",
    path: <path d="M12 3C6.9 3 3 6.7 3 11.6c0 2.6 1.1 4.8 2.9 6.3V21l2.7-1.5c1 .3 2.2.5 3.4.5 5.1 0 9-3.7 9-8.4S17.1 3 12 3Zm.9 11.3-2.3-2.4-4.4 2.4 4.9-5.2 2.3 2.4 4.3-2.4-4.8 5.2Z" />,
  },
  audience_network: { label: "Audience Network", path: <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" /> },
  threads: {
    label: "Threads",
    path: <path d="M16.3 11.2c-.1 0-.2-.1-.3-.1-.2-3-1.8-4.7-4.6-4.7-1.7 0-3.1.7-4 2l1.6 1.1c.6-1 1.6-1.2 2.4-1.2 1 0 1.8.3 2.2.9.3.4.5 1 .6 1.7-.8-.1-1.7-.2-2.6-.1-2.6.2-4.3 1.7-4.2 3.8.1 2 1.9 3.3 4 3.2 1.6-.1 2.9-.7 3.7-1.9.6-.9 1-2 1.1-3.4.7.4 1.2 1 1.5 1.7.5 1.2.5 3.1-1 4.6-1.3 1.3-2.9 1.9-5.3 1.9-2.6 0-4.6-.9-5.9-2.5C5.2 16.7 4.6 14.6 4.6 12s.6-4.7 1.9-6.3C7.8 4.1 9.8 3.3 12.4 3.3c2.6 0 4.6.8 6 2.4.7.8 1.2 1.8 1.5 2.9l1.9-.5c-.4-1.4-1-2.6-1.9-3.7C18.1 2.4 15.6 1.4 12.4 1.4 9.2 1.4 6.7 2.4 5 4.5 3.5 6.4 2.7 8.9 2.7 12s.8 5.6 2.3 7.5c1.7 2.1 4.2 3.1 7.4 3.1 2.8 0 4.8-.8 6.5-2.4 2.2-2.2 2.1-4.9 1.4-6.6-.5-1.1-1.4-2-2.6-2.4Zm-4.6 4.4c-1.1.1-2.2-.4-2.3-1.4 0-.7.5-1.5 2.2-1.6h.6c.6 0 1.2.1 1.7.2-.2 2.3-1.3 2.8-2.2 2.8Z" />,
  },
};

export function PlatformIcons({ platforms, className }: { platforms: string[]; className?: string }) {
  const shown = platforms.filter((p) => ICONS[p]).slice(0, 4);
  if (!shown.length) return null;
  return (
    <span className={cn("flex items-center gap-1 text-muted-foreground", className)}>
      {shown.map((p) => (
        <svg key={p} viewBox="0 0 24 24" className="size-3.5 fill-current" role="img" aria-label={ICONS[p]!.label}>
          <title>{ICONS[p]!.label}</title>
          {ICONS[p]!.path}
        </svg>
      ))}
    </span>
  );
}
