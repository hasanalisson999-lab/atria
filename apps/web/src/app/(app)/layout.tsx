import { Suspense } from "react";
import { AdPanelProvider } from "@/components/ad/ad-panel";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { WheelScroll } from "@/components/shell/wheel-scroll";

function TopbarFallback() {
  return (
    <header className="sticky top-0 z-30 h-14 border-b bg-background/80 backdrop-blur-xl">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6">
        <div className="skeleton-shimmer h-9 w-full max-w-xl rounded-full" />
      </div>
    </header>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AdPanelProvider>
    <WheelScroll />
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopbarFallback />}>
          <Topbar />
        </Suspense>
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</main>
      </div>
    </div>
    </AdPanelProvider>
  );
}
