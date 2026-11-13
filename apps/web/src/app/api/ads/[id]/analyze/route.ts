import { runAnalysis } from "@/lib/server/analyze";

export const maxDuration = 120;

/** AI breakdown for one ad. Runs in parallel with everything else (server actions would queue). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json(await runAnalysis(id));
}
