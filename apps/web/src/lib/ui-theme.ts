"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Interface styles: complete looks for the whole app (colours, fonts, corners, surfaces, shadows), picked in
 * Settings → Appearance. The tokens live in src/app/ui-themes.css; the choice is <html data-ui="…">, saved in
 * localStorage and restored before first paint by the head script in lib/fold-script.ts.
 */
export const UI_THEMES = [
  { id: "atria", name: "Atria", description: "Clean and bright with wide display type. The original." },
  { id: "studio", name: "Studio", description: "A pro tool. Icon rail, compact type, contact-sheet ads and an inspector." },
  { id: "gallery", name: "Gallery", description: "A museum. White walls, framed ads with labels, quiet text menu." },
  { id: "bento", name: "Bento", description: "Playful colour tiles, a floating pill menu and a popup that fits one screen." },
  { id: "feed", name: "Feed", description: "A social app. Brands as stories, ads as posts, AI notes as comments." },
] as const;

export type UiThemeId = (typeof UI_THEMES)[number]["id"];
const IDS = new Set<string>(UI_THEMES.map((t) => t.id));
export const UI_THEME_KEY = "ui-theme";

const read = (): UiThemeId => {
  const v = document.documentElement.getAttribute("data-ui");
  return v && IDS.has(v) ? (v as UiThemeId) : "atria";
};

function apply(id: UiThemeId) {
  if (id === "atria") document.documentElement.removeAttribute("data-ui");
  else document.documentElement.setAttribute("data-ui", id);
  try {
    localStorage.setItem(UI_THEME_KEY, id);
  } catch {
    /* private mode: the style still applies for this visit */
  }
}

/** Current interface style and a setter that plays a circular reveal from the click point. */
export function useUiTheme(): [UiThemeId, (id: UiThemeId, from?: { x: number; y: number }) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui"] });
      return () => mo.disconnect();
    },
    read,
    () => "atria" as UiThemeId,
  );
  const set = useCallback((id: UiThemeId, from?: { x: number; y: number }) => {
    if (id === read()) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || reduce) return apply(id);
    const x = from?.x ?? window.innerWidth / 2;
    const y = from?.y ?? window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const t = doc.startViewTransition(() => apply(id));
    void t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  }, []);
  return [theme, set];
}
