import * as React from "react";
import { motion, useMotionValue, useTransform, animate, type HTMLMotionProps } from "framer-motion";

export interface FadeUpProps extends HTMLMotionProps<"div"> {
  delay?: number;
}

export const FadeUp = React.forwardRef<HTMLDivElement, FadeUpProps>(
  ({ delay = 0, children, ...props }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay }}
      {...props}
    >
      {children}
    </motion.div>
  )
);
FadeUp.displayName = "FadeUp";

export interface PressScaleProps extends HTMLMotionProps<"div"> {
  as?: "div" | "button";
}

export const PressScale = React.forwardRef<HTMLElement, PressScaleProps>(
  ({ as = "div", children, ...props }, ref) => {
    const Comp: any = as === "button" ? motion.button : motion.div;
    return (
      <Comp
        ref={ref as any}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
PressScale.displayName = "PressScale";

export interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  locale?: string;
}

export function CountUp({
  value,
  duration = 0.9,
  decimals = 2,
  prefix = "",
  suffix = "",
  className,
  locale = "en-US",
}: CountUpProps) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = React.useState(() => format(0, decimals, locale));

  React.useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(format(latest, decimals, locale)),
    });
    return controls.stop;
  }, [value, duration, decimals, locale, mv]);

  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

function format(n: number, decimals: number, locale: string) {
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
