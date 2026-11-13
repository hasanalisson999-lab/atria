import sharp from "sharp";
import type { Queryable } from "../db/client.ts";

/**
 * Perceptual "difference hash" (dHash): shrink to 9x8 greyscale and record whether each pixel is
 * brighter than its right neighbour → 64 bits. Re-encodes, resizes and new upload copies of the same
 * picture give the same (or nearly the same) hash; different creatives differ in many bits.
 */
export async function dHash(image: Uint8Array | Buffer): Promise<string> {
  const px = await sharp(image).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (px[y * 9 + x]! > px[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Hashes within this many bits are treated as the same creative. */
export const SAME_CREATIVE_BITS = 6;

/**
 * Groups items (per brand) whose hashes are within `threshold` bits, using union-find.
 * Returns item id -> group id (the smallest id in the group, so it is stable across runs).
 */
export function groupByHash(items: { id: string; group: string; hash: string | null; textKey?: string | null }[], threshold = SAME_CREATIVE_BITS): Map<string, string> {
  const parent = new Map(items.map((i) => [i.id, i.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  const byGroup = new Map<string, { id: string; hash: string }[]>();
  for (const i of items) if (i.hash) byGroup.set(i.group, [...(byGroup.get(i.group) ?? []), { id: i.id, hash: i.hash }]);
  for (const list of byGroup.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (hamming(list[a]!.hash, list[b]!.hash) <= threshold) union(list[a]!.id, list[b]!.id);
      }
    }
  }
  // Same brand + identical copy + same format = the same ad concept (other frame / image variant).
  const byText = new Map<string, string>();
  for (const i of items) {
    if (!i.textKey) continue;
    const k = `${i.group}|${i.textKey}`;
    const first = byText.get(k);
    if (first) union(first, i.id);
    else byText.set(k, i.id);
  }
  return new Map(items.map((i) => [i.id, find(i.id)]));
}

/**
 * Copy fingerprint: lower-case words of the primary text + headline + format. Null when there is too
 * little copy to be sure two ads are the same concept.
 */
export function copyKey(body: string | null, headline: string | null, format: string | null): string | null {
  const norm = (t: string | null) => (t ?? "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const b = norm(body);
  const h = norm(headline);
  if (b.length < 25 && h.length < 12) return null;
  return `${b}|${h}|${format ?? ""}`;
}

/**
 * Fingerprints thumbnails that have no hash yet, then recomputes creative groups per brand.
 * Only downloads small preview images (no video), so it is free and quick.
 */
export async function dedupeCreatives(
  db: Queryable,
  opts: { concurrency?: number; log?: (m: string) => void; brandId?: string } = {},
): Promise<{ hashed: number; failed: number; groups: number; ads: number }> {
  const log = opts.log ?? (() => {});
  // Fingerprint only what's new (optionally one brand), so a brand sync stays fast.
  const todo = opts.brandId
    ? await db.query<{ id: string; thumbnail_url: string }>("select id, thumbnail_url from public.ads where thumb_hash is null and thumbnail_url is not null and brand_id = $1", [opts.brandId])
    : await db.query<{ id: string; thumbnail_url: string }>("select id, thumbnail_url from public.ads where thumb_hash is null and thumbnail_url is not null");
  let hashed = 0;
  let failed = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const res = await fetch(item.thumbnail_url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(String(res.status));
        const hash = await dHash(new Uint8Array(await res.arrayBuffer()));
        await db.query("update public.ads set thumb_hash = $2 where id = $1", [item.id, hash]);
        hashed++;
      } catch {
        failed++;
        await db.query("update public.ads set thumb_hash = 'x' where id = $1", [item.id]); // don't retry dead links forever
      }
      if ((hashed + failed) % 200 === 0) log(`fingerprinted ${hashed + failed}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 8 }, worker));

  const rows = opts.brandId
    ? await db.query<{ id: string; brand_id: string | null; thumb_hash: string | null; body_text: string | null; headline: string | null; format: string | null }>(
        "select id, brand_id, thumb_hash, body_text, headline, format::text as format from public.ads where brand_id = $1",
        [opts.brandId],
      )
    : await db.query<{ id: string; brand_id: string | null; thumb_hash: string | null; body_text: string | null; headline: string | null; format: string | null }>(
        "select id, brand_id, thumb_hash, body_text, headline, format::text as format from public.ads",
      );
  const groups = groupByHash(
    rows.map((r) => ({ id: r.id, group: r.brand_id ?? "none", hash: r.thumb_hash && r.thumb_hash !== "x" ? r.thumb_hash : null, textKey: copyKey(r.body_text, r.headline, r.format) })),
  );
  const payload = [...groups.entries()].map(([id, g]) => ({ id, g }));
  for (let i = 0; i < payload.length; i += 1000) {
    await db.query(
      "update public.ads a set creative_group = x.g from jsonb_to_recordset($1::text::jsonb) as x(id uuid, g text) where a.id = x.id and a.creative_group is distinct from x.g",
      [JSON.stringify(payload.slice(i, i + 1000))],
    );
  }
  return { hashed, failed, groups: new Set(groups.values()).size, ads: rows.length };
}
