"use server";

import { NoFreeModelError, generate, keysFromEnv } from "@signal/shared/ai";
import { fromPostgresJs } from "@signal/shared/db";
import { revalidatePath } from "next/cache";
import { getBrandSettings } from "@/app/studio-actions";
import { getSql, isUnavailable } from "@/lib/server/db";

export interface BoardBrief {
  text: string;
  /** Ad ids in [A1], [A2]… order, so citations keep pointing at the right ads. */
  ids: string[];
  model: string;
  at: string;
}

/**
 * Reads every ad saved on a board and writes what they share, the patterns worth stealing, and three
 * concepts for our brand (free models; cached on the board until regenerated).
 */
export async function generateBoardBrief(boardId: string): Promise<{ ok: true; brief: BoardBrief } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(boardId)) return { ok: false, error: "Invalid board" };
  const sql = getSql();
  if (isUnavailable(sql)) return { ok: false, error: sql.reason };
  const keys = keysFromEnv();
  try {
    const rows = await sql<
      { id: string; brand: string | null; format: string; days_running: number | null; headline: string | null; body_text: string | null; cta: string | null; hook_text: string | null; angle: string | null; note: string | null }[]
    >`
      select a.id, b.name as brand, a.format::text as format, a.days_running, a.headline, left(a.body_text, 400) as body_text, a.cta, x.hook_text, x.angle, bi.note
      from public.board_items bi join public.ads a on a.id = bi.ad_id
      left join public.brands b on b.id = a.brand_id left join public.ad_analysis x on x.ad_id = a.id
      where bi.board_id = ${boardId} order by bi.added_at desc limit 40`;
    if (rows.length < 2) return { ok: false, error: "Save at least 2 ads to this board first" };
    const [board] = await sql<{ name: string; description: string | null }[]>`select name, description from public.boards where id = ${boardId}`;
    const p = await getBrandSettings();
    const context = rows
      .map((r, i) =>
        [
          `[A${i + 1}] ${r.brand} · ${r.format === "dco" ? "dynamic" : r.format} · running ${r.days_running ?? "?"} days`,
          r.hook_text ? `  Hook: "${r.hook_text}"` : null,
          r.headline ? `  Headline: ${r.headline}` : null,
          r.body_text ? `  Copy: ${r.body_text.replace(/\s+/g, " ")}` : null,
          r.cta ? `  CTA: ${r.cta}` : null,
          r.angle ? `  Angle: ${r.angle}` : null,
          r.note ? `  Saved because: ${r.note}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n");
    const prompt = `You are a senior creative strategist for ${p.name} (${p.products}; audience: ${p.audience}; voice: ${p.voice}).
These are the ads saved on the board "${board?.name ?? "Board"}"${board?.description ? ` (${board.description})` : ""}. Use only them as evidence and cite inline as [A1], [A3].

Write in Markdown, tight and specific:
## What these ads share
3 bullets.
## Patterns to steal
4-6 bullets covering hooks, formats, offers and visuals, each with refs.
## 3 concepts for ${p.name}
Numbered. For each: **name**, the hook line, format, and one line on why it should win.

BOARD (${rows.length} ads)
${context}`;
    const r = await generate(keys, fromPostgresJs(sql), { prompt, operation: "board-brief", temperature: 0.7, maxTokens: 2000 });
    const brief: BoardBrief = { text: r.text.trim(), ids: rows.map((x) => x.id), model: r.model, at: new Date().toISOString() };
    await sql`update public.boards set ai_brief = ${JSON.stringify(brief)}, ai_brief_at = now() where id = ${boardId}`;
    revalidatePath(`/boards/${boardId}`);
    return { ok: true, brief };
  } catch (e) {
    return { ok: false, error: e instanceof NoFreeModelError || e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
}
