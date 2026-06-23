import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Visual density: compact for inline panels, default for page-level. */
  size?: "sm" | "md";
  /** Optional eyebrow label shown above the title. */
  eyebrow?: string;
  /** Render without the GlassCard chrome (caller provides the container). */
  bare?: boolean;
}

/**
 * On-brand empty state used everywhere the app has nothing to show.
 * Consistent layout: soft icon medallion, title, supporting line, optional CTA.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md",
  eyebrow,
  bare = false,
}: EmptyStateProps) {
  const inner = (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        size === "sm" ? "py-6 px-4 gap-2" : "py-10 px-6 gap-3",
        className
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full",
          size === "sm" ? "w-12 h-12" : "w-16 h-16",
          "bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20"
        )}
      >
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl opacity-60" />
        <Icon
          className={cn(
            "relative text-primary",
            size === "sm" ? "w-5 h-5" : "w-7 h-7"
          )}
          strokeWidth={1.6}
        />
      </div>

      {eyebrow && (
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mt-1">
          {eyebrow}
        </p>
      )}

      <h3
        className={cn(
          "font-display font-bold text-foreground",
          size === "sm" ? "text-base" : "text-lg"
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            "text-muted-foreground max-w-sm leading-relaxed",
            size === "sm" ? "text-xs" : "text-sm"
          )}
        >
          {description}
        </p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );

  if (bare) return inner;

  return (
    <GlassCard padding={size === "sm" ? "sm" : "md"} className={className}>
      {inner}
    </GlassCard>
  );
}

export default EmptyState;
