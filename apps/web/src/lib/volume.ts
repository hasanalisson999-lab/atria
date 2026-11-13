"use client";

import { useSyncExternalStore } from "react";

/** One volume for every ad video, remembered across visits. 0 = muted. Sound is ON by default. */
const KEY = "atria.volume";
const DEFAULT_VOLUME = 0.7;
let volume = DEFAULT_VOLUME;
const listeners = new Set<() => void>();
try {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(KEY);
    if (saved !== null && Number.isFinite(Number(saved))) volume = Math.min(1, Math.max(0, Number(saved)));
  }
} catch {
  /* storage blocked: stay muted */
}

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  try {
    window.localStorage.setItem(KEY, String(volume));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useVolume() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => volume,
    () => DEFAULT_VOLUME,
  );
}

/** True once the user has clicked/tapped/typed on the page (browsers allow sound only after that). */
export function hasUserActivation() {
  return typeof navigator !== "undefined" && "userActivation" in navigator ? (navigator as Navigator & { userActivation: { hasBeenActive: boolean } }).userActivation.hasBeenActive : true;
}
