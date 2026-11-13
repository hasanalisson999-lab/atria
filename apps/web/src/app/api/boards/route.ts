import { createBoardRow } from "@/lib/server/boards";

const fail = (e: unknown) => Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });

/** Create a board. Body: { name, adIds?, color?, description? }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; adIds?: string[]; color?: string; description?: string };
  try {
    return Response.json({ ok: true, id: await createBoardRow(body.name ?? "", { adIds: Array.isArray(body.adIds) ? body.adIds : [], color: body.color, description: body.description }) });
  } catch (e) {
    return fail(e);
  }
}
