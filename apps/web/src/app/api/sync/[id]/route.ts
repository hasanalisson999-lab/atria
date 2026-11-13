import { syncRegistry } from "@/lib/server/brand-sync";

/** Progress of a background brand sync, polled by the UI. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json(syncRegistry.get(id) ?? null, { headers: { "Cache-Control": "no-store" } });
}
