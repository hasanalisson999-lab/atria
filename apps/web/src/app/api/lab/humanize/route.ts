import { humanizeText } from "@/lib/server/lab";

export const maxDuration = 60;

/** Human check: edit pasted text into more human writing. Body: { text, kind: "script" | "caption" | "copy" }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; kind?: string };
  const text = body.text?.trim();
  if (!text) return Response.json({ ok: false, error: "Paste some text first" }, { status: 400 });
  const kind = body.kind === "script" || body.kind === "caption" ? body.kind : "copy";
  try {
    return Response.json({ ok: true, ...(await humanizeText(text, kind)) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
}
