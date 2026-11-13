import { editLab, fixLab, generateLab, LAB_SECTIONS, type LabSection } from "@/lib/server/lab";

export const maxDuration = 120;

/** Generate (or regenerate) one Brand Lab section, or { fix: true } to clean its AI patterns. Body: { adId? } for remix; { topic, platform, length, format } for one script. */
export async function POST(req: Request, ctx: { params: Promise<{ section: string }> }) {
  const { section } = await ctx.params;
  if (!LAB_SECTIONS.includes(section as LabSection)) return Response.json({ ok: false, error: "Unknown section" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { adId?: string; topic?: string; platform?: string; length?: string; format?: string; fix?: boolean };
  const adId = body.adId && /^[0-9a-f-]{36}$/i.test(body.adId) ? body.adId : null;
  if (section === "remix" && !adId) return Response.json({ ok: false, error: "Pick an ad to remix" }, { status: 400 });
  try {
    // { fix: true } rewrites only the lines the human check flags; everything else stays as it is.
    if (body.fix) return Response.json({ ok: true, entry: await fixLab(section as LabSection, adId) });
    const entry = await generateLab(section as LabSection, {
      adId,
      topic: body.topic?.trim() || null,
      platform: body.platform ?? null,
      length: body.length ?? null,
      format: body.format ?? null,
    });
    return Response.json({ ok: true, entry });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
}

/** Save one hand edit. Body: { path, value, adId? } (path like "taglines.2" or "pillars.0.line"). */
export async function PATCH(req: Request, ctx: { params: Promise<{ section: string }> }) {
  const { section } = await ctx.params;
  if (!LAB_SECTIONS.includes(section as LabSection)) return Response.json({ ok: false, error: "Unknown section" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { path?: string; value?: string; adId?: string };
  if (typeof body.path !== "string" || typeof body.value !== "string") return Response.json({ ok: false, error: "Send a path and a value" }, { status: 400 });
  const adId = body.adId && /^[0-9a-f-]{36}$/i.test(body.adId) ? body.adId : null;
  try {
    await editLab(section as LabSection, body.path, body.value, adId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
}
