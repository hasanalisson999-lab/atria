import { cn } from "@/lib/utils";

/**
 * Infinite horizontal ticker (Atria's ad ticker). Children are rendered twice and the track slides
 * by -50%, so the loop is seamless. Hover pauses; reduced-motion users get a static row.
 */
export function Marquee({
  children,
  duration = 36,
  reverse = false,
  className,
  gap = "0.75rem",
}: {
  children: React.ReactNode;
  duration?: number;
  reverse?: boolean;
  className?: string;
  gap?: string;
}) {
  return (
    <div className={cn("group marquee-mask relative overflow-hidden", className)}>
      <div
        className="marquee-track"
        style={{ "--marquee-duration": `${duration}s`, animationDirection: reverse ? "reverse" : undefined } as React.CSSProperties}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center" style={{ gap, paddingRight: gap }} aria-hidden={copy === 1 || undefined}>
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
