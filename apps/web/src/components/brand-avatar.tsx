"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Brand logo: high-res source first, then the small CDN thumbnail, then a monogram. */
export function BrandAvatar({ name, src, fallbackSrc, className }: { name: string | null; src: string | null; fallbackSrc?: string | null; className?: string }) {
  const sources = [src, fallbackSrc].filter((s): s is string => !!s);
  const [idx, setIdx] = useState(0);
  const initial = (name ?? "?").trim().slice(0, 1).toUpperCase();
  const current = sources[idx];
  if (!current)
    return (
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink/40 to-secondary font-display text-[0.7rem] font-semibold", className)}>
        {initial}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote logo
    <img
      key={current}
      src={current}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
      className={cn("size-7 shrink-0 rounded-full border bg-white object-cover", className)}
    />
  );
}
