"use client";

import { useEffect } from "react";

/** Nearest ancestor that scrolls sideways (and has room to), or null. */
function horizontalScroller(start: EventTarget | null): HTMLElement | null {
  for (let el = start instanceof HTMLElement ? start : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const ox = getComputedStyle(el).overflowX;
    // Tall strips (rows of ads) keep normal page scrolling: they have arrow buttons instead.
    if (ox === "auto" || ox === "scroll") return el.clientHeight > 180 ? null : el;
  }
  return null;
}

/**
 * App-wide: the normal mouse wheel scrolls short sideways strips (brand rails, tabs) while the
 * pointer is over it. At either end of the strip the page scrolls as usual. Trackpads' native sideways
 * gestures are left alone.
 */
export function WheelScroll() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const el = horizontalScroller(e.target);
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY * (e.deltaMode === 1 ? 32 : 1), behavior: "auto" });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
