"use client";

import { Loader2, Plus, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { categoryStatus, seedCategory } from "@/app/category-actions";

type Status = Awaited<ReturnType<typeof categoryStatus>>;

/**
 * Brings a category's brands into the library on demand. Opens automatically the first time a
 * near-empty category is viewed; otherwise offers "Add more brands". Shows brands as they arrive.
 */
export function CategorySeeder({ categoryId, label, count, remaining }: { categoryId: string; label: string; count: number; remaining: number }) {
  const router = useRouter();
  const [st, setSt] = useState<Status>(null);
  const [tick, setTick] = useState(0);
  const lastDone = useRef(0);
  const autoKey = `atria.seeded.${categoryId}`;

  const start = async () => {
    const r = await seedCategory(categoryId, 8);
    if (!r.ok) return toast.error(r.error);
    lastDone.current = 0;
    setTick((t) => t + 1);
  };

  // First visit to a (nearly) empty category: start pulling its brands right away.
  useEffect(() => {
    let auto = false;
    try {
      auto = count < 24 && remaining > 0 && !sessionStorage.getItem(autoKey);
      if (auto) sessionStorage.setItem(autoKey, "1");
    } catch {
      /* storage blocked */
    }
    // start() only sets state after the server action resolves (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (auto) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Poll while running; refresh the feed each time another brand lands.
  useEffect(() => {
    let live = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    void categoryStatus(categoryId).then((s) => {
      if (!live) return;
      setSt(s);
      if (s?.state === "running") {
        if (s.done > lastDone.current) {
          lastDone.current = s.done;
          router.refresh();
        }
        t = setTimeout(() => setTick((x) => x + 1), 2500);
      } else if (s?.state === "done" && s.finishedAt && Date.now() - s.finishedAt < 10_000) router.refresh();
    });
    return () => {
      live = false;
      if (t) clearTimeout(t);
    };
  }, [tick, categoryId, router]);

  const running = st?.state === "running";
  if (!running && remaining <= 0) return null;
  return (
    <AnimatePresence mode="wait">
      {running ? (
        <motion.div key="run" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="wash-pink flex flex-col gap-3 rounded-[24px] border p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="relative grid size-10 place-items-center rounded-full bg-ink text-pink">
              <Loader2 className="size-4 animate-spin" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold">
                Bringing in {label.toLowerCase()} brands · {st.done}/{st.total}
              </span>
              <span className="text-xs text-muted-foreground">Finding each brand&apos;s official page and its latest public ads. New ads appear below as they land.</span>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-card">
            <motion.div className="h-full rounded-full bg-pink" animate={{ width: `${Math.max(6, (st.done / Math.max(1, st.total)) * 100)}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          </div>
          {st.added.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {st.added.map((n) => (
                <motion.span key={n} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="rounded-full bg-card px-2.5 py-1 text-xs font-medium">
                  {n}
                </motion.span>
              ))}
            </div>
          )}
        </motion.div>
      ) : (
        <motion.button
          key="more"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => void start()}
          className="group/more inline-flex items-center gap-2 self-start rounded-full border bg-card py-1.5 pr-4 pl-1.5 text-sm transition-[border-color,transform] hover:-translate-y-0.5 hover:border-pink/60"
        >
          <span className="grid size-7 place-items-center rounded-full bg-secondary transition-colors group-hover/more:bg-pink group-hover/more:text-[#0a0a0b]">
            <Plus className="size-3.5" />
          </span>
          Add {Math.min(8, remaining)} more {label.toLowerCase()} brands
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="size-3" /> {remaining} waiting
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
