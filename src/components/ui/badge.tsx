import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

const badgeVariants = cva(
  "font-ui inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-sand-100 text-stone-700",
        accent: "bg-teal-100 text-teal-600",
        success: "bg-emerald-50 text-success",
        warning: "bg-amber-50 text-warning",
        danger: "bg-red-50 text-danger",
        ink: "bg-ink-800 text-sidebar-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
