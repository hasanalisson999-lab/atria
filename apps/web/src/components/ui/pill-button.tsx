import { Slot } from "radix-ui";
import { ArrowUpRight } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Pill CTA with a circled arrow. On hover the arrow exits to the top-right while a fresh arrow
 * slides in from the bottom-left, and the pill shifts slightly to make room.
 */
const pill = cva(
  "group/pill relative inline-flex items-center gap-3 rounded-full font-medium whitespace-nowrap select-none outline-none transition-[background-color,box-shadow,transform,color] duration-300 ease-[var(--ease-standard)] focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        pink: "bg-pink text-[#0a0a0b] hover:shadow-[var(--glow-pink)]",
        ink: "bg-ink text-ink-foreground hover:shadow-[var(--shadow-lift)]",
        outline: "border border-border bg-card text-foreground hover:border-foreground/25 hover:shadow-[var(--shadow-card)]",
      },
      size: {
        sm: "h-9 pr-1 pl-4 text-sm",
        md: "h-11 pr-1.5 pl-5 text-[0.95rem]",
        lg: "h-14 pr-2 pl-7 text-lg",
      },
    },
    defaultVariants: { variant: "pink", size: "md" },
  },
);

const circle = cva("relative grid place-items-center overflow-hidden rounded-full transition-transform duration-300 ease-[var(--ease-standard)] group-hover/pill:rotate-0", {
  variants: {
    variant: {
      pink: "bg-white text-[#0a0a0b]",
      ink: "bg-pink text-[#0a0a0b]",
      outline: "bg-ink text-ink-foreground",
    },
    size: { sm: "size-7", md: "size-8", lg: "size-10" },
  },
  defaultVariants: { variant: "pink", size: "md" },
});

type PillProps = React.ComponentProps<"button"> & VariantProps<typeof pill> & { asChild?: boolean; icon?: React.ReactNode };

export function PillButton({ className, variant, size, asChild, icon, children, ...props }: PillProps) {
  const Comp = asChild ? Slot.Root : "button";
  const iconCls = size === "lg" ? "size-5" : "size-4";
  const glyph = icon ?? <ArrowUpRight className={iconCls} strokeWidth={2.25} />;
  return (
    <Comp data-slot="pill-button" className={cn(pill({ variant, size }), className)} {...props}>
      <Slot.Slottable>{children}</Slot.Slottable>
      <span className={circle({ variant, size })} aria-hidden>
        <span className="absolute inset-0 grid place-items-center transition-transform duration-300 ease-[var(--ease-standard)] group-hover/pill:translate-x-[140%] group-hover/pill:-translate-y-[140%]">
          {glyph}
        </span>
        <span className="absolute inset-0 grid -translate-x-[140%] translate-y-[140%] place-items-center transition-transform duration-300 ease-[var(--ease-standard)] group-hover/pill:translate-x-0 group-hover/pill:translate-y-0">
          {glyph}
        </span>
      </span>
    </Comp>
  );
}
