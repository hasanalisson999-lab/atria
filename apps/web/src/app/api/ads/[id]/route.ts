import { getAd } from "@/lib/server/ads";

/** Ad detail for the popup. A plain route (not a server action) so it never queues behind other work. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false, error: "Invalid ad" }, { status: 400 });
  const r = await getAd(id);
  if (!r.ok) return Response.json({ ok: false, error: r.reason }, { status: 503 });
  if (!r.data) return Response.json({ ok: false, error: "Ad not found" }, { status: 404 });
  return Response.json({ ok: true, ad: r.data }, { headers: { "Cache-Control": "no-store" } });
}
