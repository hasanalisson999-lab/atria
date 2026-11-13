import { deleteScript, reviseScript, updateScript, type ScriptPatch } from "@/lib/server/lab";

export const maxDuration = 120;

const fail = (e: unknown) => Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });

/** Rewrite one script. Body: { instruction }. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { instruction?: string };
  const instruction = body.instruction?.trim();
  if (!instruction) return Response.json({ ok: false, error: "Say what to change" }, { status: 400 });
  try {
    return Response.json({ ok: true, entry: await reviseScript(id, instruction) });
  } catch (e) {
    return fail(e);
  }
}

/** Save edits to a script. Body: any of { status, title, hook, lines, caption, hashtags }. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as ScriptPatch;
  try {
    return Response.json({ ok: true, entry: await updateScript(id, body) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return Response.json({ ok: true, entry: await deleteScript(id) });
  } catch (e) {
    return fail(e);
  }
}
