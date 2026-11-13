import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BoardsApp } from "@/components/boards/boards-app";
import { ErrorState, SkeletonBlock } from "@/components/states";
import { getAdsByIds } from "@/lib/server/ads";
import { getBoard, getBoards, getRecentSaves } from "@/lib/server/boards";

export const metadata = { title: "Boards" };

/** /boards is every board; /boards/<id> one board (its tab, filters and sort live in the query string). */
export default function BoardsPage({ params }: PageProps<"/boards/[[...slug]]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Boards params={params} />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-12 lg:grid-cols-[232px_minmax(0,1fr)]">
      <div className="hidden flex-col gap-2 lg:flex">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-8">
        <SkeletonBlock className="h-24 w-2/3 rounded-2xl" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBlock key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

async function Boards({ params }: { params: PageProps<"/boards/[[...slug]]">["params"] }) {
  await connection();
  const { slug = [] } = await params;
  if (slug.length > 1 || (slug[0] && !/^[0-9a-f-]{36}$/i.test(slug[0]))) redirect("/boards");
  const boards = await getBoards();
  if (!boards.ok) return <ErrorState title="Boards unavailable" reason={boards.reason} />;

  if (slug[0]) {
    const board = await getBoard(slug[0]);
    if (!board.ok) return <ErrorState reason={board.reason} />;
    if (!board.data) redirect("/boards");
    const ads = await getAdsByIds(board.data.items.map((i) => i.ad_id));
    // Keep the board's saved order (newest first).
    const order = new Map(board.data.items.map((i, k) => [i.ad_id, k]));
    const list = (ads.ok ? ads.data : []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return <BoardsApp boards={boards.data} current={{ board: board.data, ads: list }} recent={[]} />;
  }

  const recent = await getRecentSaves(24);
  const recentAds = recent.ok && recent.data.length ? await getAdsByIds(recent.data.map((r) => r.ad_id)) : null;
  const order = new Map((recent.ok ? recent.data : []).map((r, k) => [r.ad_id, k]));
  const recentList = (recentAds?.ok ? recentAds.data : []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return <BoardsApp boards={boards.data} current={null} recent={recentList} />;
}
