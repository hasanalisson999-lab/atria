import "server-only";
import { getSql, isUnavailable, query, type Result } from "./db";

export interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  items: number;
  updated_at: string;
  covers: string[];
  brands: number;
  logos: string[];
  analyzed: number;
}

export function getBoards(): Promise<Result<BoardSummary[]>> {
  return query(
    (sql) => sql<BoardSummary[]>`
      select bo.id, bo.name, bo.description, bo.color, bo.updated_at,
             count(bi.ad_id)::int as items,
             count(distinct a.brand_id)::int as brands,
             coalesce((array_agg(a.thumbnail_url order by bi.added_at desc) filter (where a.thumbnail_url is not null))[1:4], '{}') as covers,
             coalesce((array_agg(distinct br.logo_url) filter (where br.logo_url is not null))[1:4], '{}') as logos,
             count(distinct x.ad_id)::int as analyzed
      from public.boards bo
      left join public.board_items bi on bi.board_id = bo.id
      left join public.ads a on a.id = bi.ad_id
      left join public.brands br on br.id = a.brand_id
      left join public.ad_analysis x on x.ad_id = a.id
      group by bo.id
      order by bo.updated_at desc`,
  );
}

export interface BoardDetail {
  id: string;
  name: string;
  description: string | null;
  color: string;
  updated_at: string;
  ai_brief: { text: string; ids: string[]; model: string; at: string } | null;
  items: { ad_id: string; note: string | null; added_at: string }[];
  insights: {
    brands: { label: string; n: number }[];
    formats: { label: string; n: number }[];
    ctas: { label: string; n: number }[];
    hooks: string[];
    avgDays: number;
    analyzed: number;
  };
}

export function getBoard(id: string): Promise<Result<BoardDetail | null>> {
  return query(async (sql) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [raw] = await sql<{ id: string; name: string; description: string | null; color: string; updated_at: string; ai_brief: string | null }[]>`
      select id, name, description, color, updated_at, ai_brief from public.boards where id = ${id}`;
    if (!raw) return null;
    let brief: BoardDetail["ai_brief"] = null;
    try {
      brief = raw.ai_brief ? (JSON.parse(raw.ai_brief) as BoardDetail["ai_brief"]) : null;
    } catch {
      brief = null;
    }
    const b = { ...raw, ai_brief: brief };
    const items = await sql<{ ad_id: string; note: string | null; added_at: string }[]>`
      select ad_id, note, added_at from public.board_items where board_id = ${id} order by added_at desc`;
    const rows = await sql<{ brand: string | null; format: string; cta: string | null; body_text: string | null; days_running: number | null; hook_text: string | null }[]>`
      select br.name as brand, a.format::text as format, a.cta, a.body_text, a.days_running, x.hook_text
      from public.board_items bi join public.ads a on a.id = bi.ad_id
      left join public.brands br on br.id = a.brand_id
      left join public.ad_analysis x on x.ad_id = a.id
      where bi.board_id = ${id}`;
    const tally = (vals: (string | null)[]) => {
      const m = new Map<string, number>();
      for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
      return [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, 6).map(([label, n]) => ({ label, n }));
    };
    const hooks = rows
      .map((r) => r.hook_text ?? (r.body_text ? r.body_text.replace(/\s+/g, " ").trim().match(/^(.{8,160}?[.!?…])(\s|$)/)?.[1] ?? r.body_text.slice(0, 120) : null))
      .filter((h): h is string => !!h);
    const days = rows.map((r) => r.days_running ?? 0);
    return {
      ...b,
      items,
      insights: {
        brands: tally(rows.map((r) => r.brand)),
        formats: tally(rows.map((r) => (r.format === "dco" ? "dynamic" : r.format))),
        ctas: tally(rows.map((r) => r.cta)),
        hooks: [...new Set(hooks)].slice(0, 20),
        avgDays: days.length ? Math.round(days.reduce((a, c) => a + c, 0) / days.length) : 0,
        analyzed: rows.filter((r) => r.hook_text).length,
      },
    };
  });
}

// ------------------------------------------------------------------ mutations (used by /api/boards routes)

export const BOARD_COLORS = ["pink", "lime", "sky", "amber", "violet", "slate"] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];
const ID = /^[0-9a-f-]{36}$/i;

function sqlOrThrow() {
  const sql = getSql();
  if (isUnavailable(sql)) throw new Error(sql.reason);
  return sql;
}

/** Ad ids saved most recently across every board (newest first, each ad once). */
export function getRecentSaves(limit = 24): Promise<Result<{ ad_id: string; board_id: string; board: string; color: string }[]>> {
  return query(
    (sql) => sql<{ ad_id: string; board_id: string; board: string; color: string }[]>`
      select ad_id, board_id, board, color from (
        select distinct on (bi.ad_id) bi.ad_id, bi.board_id, bo.name as board, bo.color, bi.added_at
        from public.board_items bi join public.boards bo on bo.id = bi.board_id
        order by bi.ad_id, bi.added_at desc) t
      order by added_at desc limit ${Math.min(Math.max(limit, 1), 120)}`,
  );
}

export async function createBoardRow(name: string, opts: { adIds?: string[]; color?: string; description?: string } = {}): Promise<string> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error("Give the board a name");
  const sql = sqlOrThrow();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.boards`;
  const color = BOARD_COLORS.includes(opts.color as BoardColor) ? opts.color! : BOARD_COLORS[n % BOARD_COLORS.length]!;
  const [row] = await sql<{ id: string }[]>`
    insert into public.boards (user_id, name, color, description) values (null, ${clean}, ${color}, ${opts.description?.trim().slice(0, 280) || null})
    on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) do update set updated_at = now()
    returning id`;
  const ids = (opts.adIds ?? []).filter((i) => ID.test(i)).slice(0, 500);
  if (ids.length) await sql`insert into public.board_items (board_id, ad_id) select ${row!.id}::uuid, unnest(${ids}::uuid[]) on conflict do nothing`;
  return row!.id;
}

export async function updateBoard(id: string, patch: { name?: string; description?: string | null; color?: string }): Promise<void> {
  if (!ID.test(id)) throw new Error("Invalid board");
  const sql = sqlOrThrow();
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 60);
    if (!clean) throw new Error("The name can't be empty");
    const [clash] = await sql<{ id: string }[]>`select id from public.boards where lower(name) = lower(${clean}) and id <> ${id}`;
    if (clash) throw new Error("You already have a board with that name");
    await sql`update public.boards set name = ${clean}, updated_at = now() where id = ${id}`;
  }
  if (patch.description !== undefined) await sql`update public.boards set description = ${patch.description?.trim().slice(0, 280) || null}, updated_at = now() where id = ${id}`;
  if (patch.color !== undefined && BOARD_COLORS.includes(patch.color as BoardColor)) await sql`update public.boards set color = ${patch.color}, updated_at = now() where id = ${id}`;
}

export async function deleteBoardRow(id: string): Promise<void> {
  if (!ID.test(id)) throw new Error("Invalid board");
  await sqlOrThrow()`delete from public.boards where id = ${id}`;
}

/** Bulk changes to a board's ads: remove them, copy or move them to another board, or set one ad's note. */
export async function boardItems(
  id: string,
  body: { action: "remove" | "copy" | "move" | "add"; adIds: string[]; to?: string } | { action: "note"; adId: string; note: string },
): Promise<{ changed: number }> {
  if (!ID.test(id)) throw new Error("Invalid board");
  const sql = sqlOrThrow();
  if (body.action === "note") {
    if (!ID.test(body.adId)) throw new Error("Invalid ad");
    await sql`update public.board_items set note = ${body.note.trim().slice(0, 1000) || null} where board_id = ${id} and ad_id = ${body.adId}`;
    return { changed: 1 };
  }
  const ids = body.adIds.filter((i) => ID.test(i)).slice(0, 500);
  if (!ids.length) return { changed: 0 };
  if (body.action === "add") {
    const r = await sql`insert into public.board_items (board_id, ad_id) select ${id}::uuid, unnest(${ids}::uuid[]) on conflict do nothing`;
    await sql`update public.boards set updated_at = now() where id = ${id}`;
    return { changed: r.count };
  }
  if (body.action === "remove") {
    const r = await sql`delete from public.board_items where board_id = ${id} and ad_id = any(${ids}::uuid[])`;
    await sql`update public.boards set updated_at = now() where id = ${id}`;
    return { changed: r.count };
  }
  if (!body.to || !ID.test(body.to) || body.to === id) throw new Error("Pick another board");
  const to = body.to;
  const r = await sql.begin(async (tx) => {
    // Notes travel with the ads.
    const ins = await tx`insert into public.board_items (board_id, ad_id, note)
                         select ${to}::uuid, ad_id, note from public.board_items where board_id = ${id} and ad_id = any(${ids}::uuid[])
                         on conflict (board_id, ad_id) do nothing`;
    if (body.action === "move") await tx`delete from public.board_items where board_id = ${id} and ad_id = any(${ids}::uuid[])`;
    await tx`update public.boards set updated_at = now() where id in (${id}, ${to})`;
    return ins.count;
  });
  return { changed: body.action === "move" ? ids.length : r };
}
