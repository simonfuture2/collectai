import { cn } from "@/lib/utils";
import { dealVerdict } from "@/lib/insights";

export function DealChip({ asking, low, high, className }: { asking: unknown; low: unknown; high: unknown; className?: string }) {
  const v = dealVerdict(asking, low, high);
  if (!v) return null;
  const sign = v.diffPct > 0 ? "+" : v.diffPct < 0 ? "−" : "±";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold font-numeric whitespace-nowrap",
        v.tone === "good" && "bg-gain/15 text-gain",
        v.tone === "bad" && "bg-loss/15 text-loss",
        v.tone === "neutral" && "bg-muted text-muted-foreground",
        className,
      )}
      title={v.label}
    >
      {sign}{Math.abs(v.diffPct)}% vs market
    </span>
  );
}

export function InsightPill({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-secondary/15 text-secondary border border-secondary/30 px-2.5 py-0.5 text-[11px] font-semibold", className)}>
      Insight · not in your collection
    </span>
  );
}

export default DealChip;
