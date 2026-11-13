"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Collapsible panels (the app sidebar, the Brand Lab menu). The state lives on <html data-{name}="collapsed">,
 * set before first paint by FOLD_SCRIPT, so CSS (`in-data-[sidebar=collapsed]:…`) renders it right with no flash,
 * and it's remembered in localStorage.
 */
export type FoldName = "sidebar" | "labnav";


const read = (name: FoldName) => document.documentElement.getAttribute(`data-${name}`) === "collapsed";

export function useFold(name: FoldName): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: [`data-${name}`] });
      return () => mo.disconnect();
    },
    () => read(name),
    () => false,
  );
  const toggle = useCallback(() => {
    const next = !read(name);
    if (next) document.documentElement.setAttribute(`data-${name}`, "collapsed");
    else document.documentElement.removeAttribute(`data-${name}`);
    try {
      localStorage.setItem(`fold:${name}`, next ? "collapsed" : "open");
    } catch {
      /* private mode: the fold still works for this visit */
    }
  }, [name]);
  return [collapsed, toggle];
}
