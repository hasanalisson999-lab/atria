"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
] as const;

const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

/** Segmented light / dark / system switch with a sliding thumb. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const active = mounted ? (theme ?? "system") : "system";
  const index = OPTIONS.findIndex((o) => o.value === active);

  return (
    <div role="radiogroup" aria-label="Theme" className={cn("relative grid grid-cols-3 rounded-full border bg-card p-0.5", className)}>
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full bg-secondary shadow-[var(--shadow-card)] transition-transform duration-300 ease-[var(--ease-out-quart)]"
        style={{ transform: `translateX(${Math.max(index, 0) * 100}%)` }}
      />
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={active === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "relative z-10 grid h-7 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:text-foreground",
            active === value && "text-foreground",
          )}
        >
          <Icon className={cn("size-3.5 transition-transform duration-300", active === value && "scale-110")} />
        </button>
      ))}
    </div>
  );
}
