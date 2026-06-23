import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HoloFoilProps {
  /** Whether to actually render the holographic effect. */
  active?: boolean;
  /** Optional override threshold; consumers can pass active directly. */
  className?: string;
  /** Rounded radius class to match the wrapped image (so the overlay clips cleanly). */
  radiusClassName?: string;
  /** Render children (typically an <img>). The wrapper relatively positions them. */
  children: ReactNode;
  /** Optional badge (e.g. <FoilBadge label="GRADED" />) placed top-left. */
  badge?: ReactNode;
  /** Optional secondary badge placed top-right. */
  badgeRight?: ReactNode;
}

/**
 * Holographic "foil" sheen overlay. Purely presentational.
 * - Hover (desktop pointer) and touch-drag update a CSS variable that shifts the gradient.
 * - DeviceOrientation provides a passive ambient shift on mobile.
 * - Respects prefers-reduced-motion (renders a static, gentle sheen).
 * - GPU-friendly: only transform/opacity/background-position animate.
 */
export function HoloFoil({
  active = true,
  className,
  radiusClassName = "rounded-xl",
  children,
  badge,
  badgeRight,
}: HoloFoilProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!active) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [active]);

  useEffect(() => {
    if (!active || reduced) return;
    const el = ref.current;
    if (!el) return;

    const setPos = (xRel: number, yRel: number) => {
      el.style.setProperty("--mx", `${Math.max(0, Math.min(1, xRel)) * 100}%`);
      el.style.setProperty("--my", `${Math.max(0, Math.min(1, yRel)) * 100}%`);
    };

    const onPointer = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      setPos((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    };
    const onLeave = () => {
      el.style.setProperty("--mx", "50%");
      el.style.setProperty("--my", "50%");
    };
    el.addEventListener("pointermove", onPointer, { passive: true });
    el.addEventListener("pointerleave", onLeave);

    // Device orientation for mobile ambient tilt.
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      // gamma: left-right (-90..90), beta: front-back (-180..180)
      const x = (e.gamma + 45) / 90; // ~0..1
      const y = (e.beta + 45) / 90;
      setPos(x, y);
    };
    let orientationBound = false;
    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      try {
        window.addEventListener("deviceorientation", onOrient, { passive: true });
        orientationBound = true;
      } catch {
        /* noop */
      }
    }

    return () => {
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerleave", onLeave);
      if (orientationBound) window.removeEventListener("deviceorientation", onOrient);
    };
  }, [active, reduced]);

  if (!active) {
    return (
      <div className={cn("relative", className)}>
        {children}
        {(badge || badgeRight) && (
          <>
            {badge && <div className="absolute top-1.5 left-1.5 z-20">{badge}</div>}
            {badgeRight && <div className="absolute top-1.5 right-1.5 z-20">{badgeRight}</div>}
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn("relative isolate group/foil", className)}
      style={
        {
          // initial center position
          ["--mx" as any]: "50%",
          ["--my" as any]: "50%",
        } as React.CSSProperties
      }
    >
      {children}

      {/* Holographic sheen */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden mix-blend-color-dodge",
          radiusClassName,
          reduced ? "opacity-[0.18]" : "opacity-[0.32] transition-opacity duration-300 group-hover/foil:opacity-50"
        )}
        style={{
          background:
            "conic-gradient(from calc(var(--mx) * 3.6deg) at var(--mx) var(--my), hsl(190 95% 60% / 0.55), hsl(310 95% 65% / 0.55), hsl(45 100% 60% / 0.6), hsl(160 80% 55% / 0.5), hsl(280 90% 65% / 0.55), hsl(190 95% 60% / 0.55))",
          filter: "blur(6px)",
          transform: "translateZ(0)",
          willChange: "background-position, opacity",
        }}
      />

      {/* Diagonal moving highlight band */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden mix-blend-overlay",
          radiusClassName,
          reduced ? "opacity-20" : "opacity-40"
        )}
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) calc(var(--mx) - 6%), rgba(255,255,255,0.0) calc(var(--mx) + 18%), transparent 70%)",
          transform: "translateZ(0)",
          willChange: "background",
        }}
      />

      {/* Subtle gold inner ring to signal "special" */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 ring-1 ring-inset",
          radiusClassName
        )}
        style={{ boxShadow: "inset 0 0 0 1px hsl(45 95% 60% / 0.35)" }}
      />

      {badge && <div className="absolute top-1.5 left-1.5 z-20">{badge}</div>}
      {badgeRight && <div className="absolute top-1.5 right-1.5 z-20">{badgeRight}</div>}
    </div>
  );
}

interface FoilBadgeProps {
  label: string;
  className?: string;
}

export function FoilBadge({ label, className }: FoilBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md",
        "text-[9px] sm:text-[10px] font-bold uppercase tracking-wider",
        "text-black shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)]",
        "border border-amber-200/60",
        className
      )}
      style={{
        background:
          "linear-gradient(135deg, #fde68a 0%, #f5d27a 40%, #c79a3a 100%)",
      }}
    >
      <span aria-hidden className="block w-1 h-1 rounded-full bg-black/50" />
      {label}
    </span>
  );
}

/** Decision helper: when should the foil be on? */
export function shouldFoil({
  isGraded,
  value,
  threshold = 50,
}: {
  isGraded?: boolean | null | undefined;
  value?: number | null | undefined;
  threshold?: number;
}) {
  if (isGraded) return true;
  if (typeof value === "number" && value >= threshold) return true;
  return false;
}
