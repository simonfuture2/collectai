import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassCardVariants = cva(
  "rounded-2xl border border-border-subtle bg-glass backdrop-blur-xl shadow-glass",
  {
    variants: {
      padding: {
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
      hover: {
        none: "",
        lift: "transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(0,0,0,0.6)]",
      },
    },
    defaultVariants: { padding: "md", hover: "none" },
  }
);

export interface GlassCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassCardVariants> {}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, padding, hover, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(glassCardVariants({ padding, hover }), className)}
      {...props}
    />
  )
);
GlassCard.displayName = "GlassCard";
