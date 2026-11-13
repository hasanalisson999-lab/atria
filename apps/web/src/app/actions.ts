"use server";

import { revalidatePath } from "next/cache";
import { getSql, isUnavailable } from "@/lib/server/db";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function sqlOrError() {
  const sql = getSql();
  if (isUnavailable(sql)) throw new Error(sql.reason);
  return sql;
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function setBrandStatus(brandId: string, status: "tracked" | "ignored" | "discovered"): Promise<ActionResult> {
  try {
    if (!UUID.test(brandId) || !["tracked", "ignored", "discovered"].includes(status)) return { ok: false, error: "Invalid request" };
    const sql = sqlOrError();
    await sql`
      update public.brands set status = ${status}::brand_status,
        tracked_at = case when ${status} = 'tracked' then coalesce(tracked_at, now()) else null end,
        -- Tracking a brand vouches for it as a real brand; curated brands stay real brands.
        quality = case when ${status} = 'tracked' or is_curated then 'brand' else quality end
      where id = ${brandId}`;
    revalidatePath("/brands", "layout");
    revalidatePath("/tracking");
    revalidatePath("/discover");
    return { ok: true, message: status === "tracked" ? "Tracking brand" : status === "ignored" ? "Brand hidden" : "Brand restored" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- AI breakdown (Gemini free tier)

export async function analyzeAd(adId: string): Promise<ActionResult> {
  const { runAnalysis } = await import("@/lib/server/analyze");
  return runAnalysis(adId);
}

// ---------------------------------------------------------------- keywords

export async function addKeyword(formData: FormData): Promise<ActionResult> {
  try {
    const term = String(formData.get("term") ?? "").trim().toLowerCase();
    const countries = String(formData.get("countries") ?? "US")
      .split(/[\s,]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));
    if (term.length < 2 || term.length > 60) return { ok: false, error: "Keyword must be 2–60 characters" };
    if (!countries.length) return { ok: false, error: "Add at least one 2-letter country code" };
    const sql = sqlOrError();
    for (const c of countries) {
      await sql`insert into public.keywords (user_id, term, country, source, status) values (null, ${term}, ${c}, 'manual', 'active') on conflict do nothing`;
    }
    revalidatePath("/tracking");
    return { ok: true, message: `Added "${term}" for ${countries.join(", ")}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setKeywordStatus(term: string, status: "active" | "paused"): Promise<ActionResult> {
  try {
    if (!["active", "paused"].includes(status)) return { ok: false, error: "Invalid status" };
    const sql = sqlOrError();
    await sql`update public.keywords set status = ${status}::keyword_status where lower(term) = lower(${term})`;
    revalidatePath("/tracking");
    return { ok: true, message: status === "paused" ? `Paused "${term}"` : `Resumed "${term}"` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteKeyword(term: string): Promise<ActionResult> {
  try {
    const sql = sqlOrError();
    await sql`delete from public.keywords where lower(term) = lower(${term}) and source = 'manual'`;
    revalidatePath("/tracking");
    return { ok: true, message: `Removed "${term}"` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- ad detail (popup)

export async function loadAdDetail(adId: string): Promise<{ ok: true; ad: import("@/lib/server/ads").AdDetail } | { ok: false; error: string }> {
  const { getAd } = await import("@/lib/server/ads");
  const r = await getAd(adId);
  if (!r.ok) return { ok: false, error: r.reason };
  if (!r.data) return { ok: false, error: "Ad not found" };
  return { ok: true, ad: r.data };
}

// ---------------------------------------------------------------- boards

const BOARD_COLORS = ["pink", "lime", "sky", "amber", "violet", "slate"];

export interface BoardOption {
  id: string;
  name: string;
  color: string;
  items: number;
  saved: boolean;
}

export async function listBoardsForAd(adId: string): Promise<{ ok: true; boards: BoardOption[] } | { ok: false; error: string }> {
  try {
    const sql = sqlOrError();
    const rows = await sql<BoardOption[]>`
      select bo.id, bo.name, bo.color, count(bi.ad_id)::int as items,
             bool_or(bi.ad_id = ${UUID.test(adId) ? adId : null}::uuid) is true as saved
      from public.boards bo left join public.board_items bi on bi.board_id = bo.id
      group by bo.id order by bo.updated_at desc`;
    return { ok: true, boards: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createBoard(name: string, adId?: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const clean = name.trim().slice(0, 60);
    if (clean.length < 1) return { ok: false, error: "Give the board a name" };
    const sql = sqlOrError();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.boards`;
    const color = BOARD_COLORS[n % BOARD_COLORS.length]!;
    const [row] = await sql<{ id: string }[]>`
      insert into public.boards (user_id, name, color) values (null, ${clean}, ${color})
      on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) do update set updated_at = now()
      returning id`;
    if (adId && UUID.test(adId)) await sql`insert into public.board_items (board_id, ad_id) values (${row!.id}, ${adId}) on conflict do nothing`;
    revalidatePath("/boards", "layout");
    return { ok: true, id: row!.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function toggleSaved(boardId: string, adId: string, save: boolean): Promise<ActionResult> {
  try {
    if (!UUID.test(boardId) || !UUID.test(adId)) return { ok: false, error: "Invalid request" };
    const sql = sqlOrError();
    if (save) await sql`insert into public.board_items (board_id, ad_id) values (${boardId}, ${adId}) on conflict do nothing`;
    else await sql`delete from public.board_items where board_id = ${boardId} and ad_id = ${adId}`;
    await sql`update public.boards set updated_at = now() where id = ${boardId}`;
    revalidatePath("/boards", "layout");
    return { ok: true, message: save ? "Saved to board" : "Removed from board" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function renameBoard(boardId: string, name: string, description?: string): Promise<ActionResult> {
  try {
    if (!UUID.test(boardId)) return { ok: false, error: "Invalid board" };
    const clean = name.trim().slice(0, 60);
    if (!clean) return { ok: false, error: "Name can't be empty" };
    const sql = sqlOrError();
    await sql`update public.boards set name = ${clean}, description = ${description?.trim().slice(0, 280) || null}, updated_at = now() where id = ${boardId}`;
    revalidatePath("/boards", "layout");
    return { ok: true, message: "Board updated" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteBoard(boardId: string): Promise<ActionResult> {
  try {
    if (!UUID.test(boardId)) return { ok: false, error: "Invalid board" };
    const sql = sqlOrError();
    await sql`delete from public.boards where id = ${boardId}`;
    revalidatePath("/boards", "layout");
    return { ok: true, message: "Board deleted" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setBoardNote(boardId: string, adId: string, note: string): Promise<ActionResult> {
  try {
    if (!UUID.test(boardId) || !UUID.test(adId)) return { ok: false, error: "Invalid request" };
    const sql = sqlOrError();
    await sql`update public.board_items set note = ${note.trim().slice(0, 1000) || null} where board_id = ${boardId} and ad_id = ${adId}`;
    revalidatePath(`/boards/${boardId}`);
    return { ok: true, message: "Note saved" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
