"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { fetchAd } from "@/lib/api-client";
import { AdDetailView } from "@/components/ad/ad-detail";
import { ErrorState, SkeletonBlock } from "@/components/states";
import type { AdDetail } from "@/lib/server/ads";

interface Preview {
  id: string;
  thumbnail_url?: string | null;
}

interface AdPanelApi {
  open: (id: string, list?: Preview[]) => void;
  close: () => void;
  /** Re-fetch an ad (e.g. after AI analysis) without closing the popup. */
  reload: (id: string) => Promise<void>;
  openId: string | null;
}

const Ctx = createContext<AdPanelApi | null>(null);

/** Mirrors the open ad into the URL (?ad=<id>) without a navigation, so a refresh or a shared link reopens it. */
function syncAdParam(id: string | null) {
  const url = new URL(window.location.href);
  if ((url.searchParams.get("ad") ?? null) === id) return;
  if (id) url.searchParams.set("ad", id);
  else url.searchParams.delete("ad");
  window.history.replaceState(window.history.state, "", url);
}
const AD_ID = /^[0-9a-f-]{36}$/i;

export function useAdPanel() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdPanel must be used inside <AdPanelProvider>");
  return c;
}

/**
 * One centered ad popup for the whole app (feed, brands, boards, search, studio). Stays on the same
 * page; click anywhere outside it or press Esc to close. ←/→ on the keyboard browse the current list.
 */
export function AdPanelProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [list, setList] = useState<Preview[]>([]);
  const [details, setDetails] = useState<Record<string, AdDetail>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startLoading] = useTransition();
  const requested = useRef(new Set<string>());

  const load = useCallback((id: string) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    startLoading(async () => {
      const r = await fetchAd(id);
      if (r.ok) setDetails((d) => ({ ...d, [id]: r.ad }));
      else {
        requested.current.delete(id);
        setErrors((e) => ({ ...e, [id]: r.error }));
      }
    });
  }, []);

  const open = useCallback(
    (id: string, l?: Preview[]) => {
      setList(l ?? [{ id }]);
      setOpenId(id);
      load(id);
    },
    [load],
  );
  const close = useCallback(() => setOpenId(null), []);
  const reload = useCallback(async (id: string) => {
    const r = await fetchAd(id);
    if (r.ok) setDetails((d) => ({ ...d, [id]: r.ad }));
  }, []);

  const index = openId ? list.findIndex((a) => a.id === openId) : -1;
  const step = useCallback(
    (dir: number) => {
      if (index < 0 || list.length < 2) return;
      const next = list[(index + dir + list.length) % list.length];
      if (next) {
        setOpenId(next.id);
        load(next.id);
      }
    },
    [list, index, load],
  );

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "Escape") close();
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openId, close, step]);

  // Open the ad named in the URL (?ad=<id>) on load and on Back/Forward; keep the URL in step with the popup.
  // Only write the URL once a popup has been open, so the first render never wipes an incoming ?ad=.
  const everOpened = useRef(false);
  useEffect(() => {
    const fromUrl = () => {
      const id = new URL(window.location.href).searchParams.get("ad");
      if (id && AD_ID.test(id)) open(id);
      else if (everOpened.current) setOpenId(null);
    };
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, [open]);
  useEffect(() => {
    if (openId) everOpened.current = true;
    if (everOpened.current) syncAdParam(openId);
  }, [openId]);

  // Preload neighbours so ←/→ feels instant.
  useEffect(() => {
    if (index < 0 || list.length < 2) return;
    for (const d of [1, -1]) {
      const n = list[(index + d + list.length) % list.length];
      if (n) load(n.id);
    }
  }, [index, list, load]);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const api = useMemo(
    () => ({ open, close, reload, openId }),
    [open, close, reload, openId],
  );
  const showing = openId ? details[openId] : undefined;
  const error = openId ? errors[openId] : undefined;
  const preview = index >= 0 ? list[index] : undefined;

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {openId && (
              <motion.div
                key="ad-overlay"
                className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-5"
                onClick={(e) => {
                  // Any click outside the ad or the info card closes the popup.
                  if (!(e.target as HTMLElement).closest("[data-popup-keep]")) close();
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Click anywhere outside the card to close. */}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={close}
                  className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-2xl"
                />
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Ad details"
                  className="relative z-10 h-full w-full sm:h-[min(1000px,93dvh)] sm:w-[min(1480px,94vw)]"
                  initial={{ opacity: 0, scale: 0.96, y: 18 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 10 }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 34,
                    mass: 0.85,
                  }}
                >
                  <div className="@container pointer-events-none relative h-full w-full overflow-y-auto *:pointer-events-auto sm:overflow-visible">
                    <button
                      type="button"
                      onClick={close}
                      className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:right-3 focus:z-20 focus:rounded-full focus:bg-card focus:px-3 focus:py-1 focus:text-sm"
                    >
                      Close
                    </button>
                    {error ? (
                      <div data-popup-keep className="relative mx-auto max-w-md rounded-[28px] border bg-background p-6 pt-16">
                        <ErrorState reason={error} />
                        <CloseX onClose={close} />
                      </div>
                    ) : showing ? (
                      <AdDetailView key={showing.id} ad={showing} />
                    ) : (
                      <PopupLoading thumb={preview?.thumbnail_url} onClose={close} />
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

function CloseX({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} aria-label="Close" title="Close (Esc)" className="absolute top-5 right-5 z-20 grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground transition-[background-color,color,transform] hover:rotate-90 hover:bg-ink hover:text-ink-foreground">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function PopupLoading({ thumb, onClose }: { thumb?: string | null; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center gap-4 @4xl:flex-row @4xl:items-stretch @4xl:justify-center">
      <div className="flex min-h-[50vh] min-w-0 flex-1 items-center justify-center @4xl:h-full @4xl:min-h-0">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-[22px] opacity-80 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]" />
        )}
      </div>
      <div data-popup-keep className="relative flex w-full flex-col gap-4 rounded-[28px] border bg-background p-7 @4xl:h-full @4xl:min-w-[420px] @4xl:max-w-[600px] @4xl:flex-1">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="size-11 rounded-full" />
          <SkeletonBlock className="h-6 w-40" />
        </div>
        <SkeletonBlock className="h-11 w-full rounded-full" />
        <SkeletonBlock className="h-10 rounded-full" />
        <SkeletonBlock className="h-40" />
        <CloseX onClose={onClose} />
      </div>
    </div>
  );
}
