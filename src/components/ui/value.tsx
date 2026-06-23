import * as React from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/motion";

type Size = "sm" | "md" | "lg" | "xl";
type Tone = "default" | "gain" | "loss" | "gold" | "muted";

export interface ValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number;
  currency?: string | null;
  size?: Size;
  tone?: Tone;
  animate?: boolean;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  showSign?: boolean;
}

const sizeClass: Record<Size, string> = {
  sm: "text-sm",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl md:text-6xl",
};

const toneClass: Record<Tone, string> = {
  default: "text-text-primary",
  muted: "text-text-muted",
  gain: "text-gain",
  loss: "text-loss",
  gold: "bg-gradient-gold bg-clip-text text-transparent",
};

export const Value = React.forwardRef<HTMLSpanElement, ValueProps>(
  (
    {
      amount,
      currency = "USD",
      size = "md",
      tone = "default",
      animate = true,
      decimals = 2,
      prefix,
      suffix,
      showSign = false,
      className,
      ...props
    },
    ref
  ) => {
    const sign =
      showSign || tone === "gain" || tone === "loss"
        ? amount > 0
          ? "+"
          : amount < 0
            ? "−"
            : ""
        : amount < 0
          ? "−"
          : "";
    const symbol = currency === "USD" ? "$" : currency ? `${currency} ` : "";
    const fullPrefix = `${sign}${prefix ?? ""}${symbol}`;
    const absolute = Math.abs(amount);

    return (
      <span
        ref={ref}
        className={cn(
          "font-numeric font-semibold leading-none",
          sizeClass[size],
          toneClass[tone],
          className
        )}
        {...props}
      >
        {animate ? (
          <CountUp value={absolute} decimals={decimals} prefix={fullPrefix} suffix={suffix} />
        ) : (
          <>
            {fullPrefix}
            {absolute.toLocaleString("en-US", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
            {suffix}
          </>
        )}
      </span>
    );
  }
);
Value.displayName = "Value";
