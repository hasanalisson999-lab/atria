import { deleteBoardRow, updateBoard } from "@/lib/server/boards";

const fail = (e: unknown) => Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });

/** Rename, describe or recolour a board. Body: { name?, description?, color? }. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string | null; color?: string };
  try {
    await updateBoard(id, body);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deleteBoardRow(id);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
