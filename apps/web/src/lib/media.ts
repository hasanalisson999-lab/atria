/**
 * Small, fast versions of ad images. Ad Library images are full-size originals (often 1-3 MB, 1080-2048 px)
 * but tiles show them about 300 px wide, so they go through wsrv.nl, a free image resizer with a global CDN
 * cache: a resized WebP is typically 30x smaller. Callers keep the original as a fallback (onError).
 */
const RESIZER = "https://wsrv.nl/?url=";

/** URL of `src` resized to `width` px wide (never enlarged), as WebP. Non-http sources pass through. */
export function sized(src: string | null | undefined, width: number): string | undefined {
  if (!src) return undefined;
  if (!/^https?:\/\//i.test(src) || src.startsWith(RESIZER)) return src;
  return `${RESIZER}${encodeURIComponent(src)}&w=${Math.round(width)}&we&output=webp&q=78`;
}

/** srcSet for a tile about `cssWidth` px wide: 1x and 2x versions. */
export function sizedSet(src: string | null | undefined, cssWidth: number): string | undefined {
  if (!src || !/^https?:\/\//i.test(src)) return undefined;
  return `${sized(src, cssWidth)} ${cssWidth}w, ${sized(src, cssWidth * 2)} ${cssWidth * 2}w`;
}
