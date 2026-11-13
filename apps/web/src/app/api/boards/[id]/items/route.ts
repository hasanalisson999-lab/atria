import { boardItems } from "@/lib/server/boards";

/**
 * Bulk changes to a board's ads.
 * Body: { action: "remove" | "add", adIds } · { action: "copy" | "move", adIds, to } · { action: "note", adId, note }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Parameters<typeof boardItems>[1];
  const ok = body && (body.action === "note" ? typeof body.adId === "string" && typeof body.note === "string" : ["remove", "add", "copy", "move"].includes(body.action) && Array.isArray(body.adIds));
  if (!ok) return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  try {
    return Response.json({ ok: true, ...(await boardItems(id, body)) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
}
