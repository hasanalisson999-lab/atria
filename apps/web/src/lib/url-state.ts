"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A piece of UI state (a tab, a filter, a sort) kept in the URL query string, so a refresh, Back, or a
 * shared link lands on exactly the same view. Writes use replaceState: no navigation, no server round trip.
 */
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key),
    () => null,
  );
  const value = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      const url = new URL(window.location.href);
      if (v === fallback) url.searchParams.delete(key);
      else url.searchParams.set(key, v);
      if (url.href === window.location.href) return;
      window.history.replaceState(window.history.state, "", url);
      for (const l of listeners) l();
    },
    [key, fallback],
  );
  return [value, set];
}
