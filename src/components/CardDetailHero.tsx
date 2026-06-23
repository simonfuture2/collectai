import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Value } from "@/components/ui/value";
import { FadeUp } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { HoloFoil, FoilBadge, shouldFoil } from "@/components/HoloFoil";

type Timeframe = "1D" | "1W" | "1M" | "1Y" | "ALL";
type Mode = "RAW" | "GRADED";

interface PricePoint {
  month: string;
  price: number;
  source: string;
}

interface Comp {
  price: number;
  source: string;
  date?: string;
  title?: string;
}

interface CardDetailHeroProps {
  imageUrl: string;
  name?: string | null;
  set?: string | null;
  year?: string | null;
  number?: string | null;
  parallel?: string | null;
  rawValue: number;
  gradedValue: number | null;
  gradedLabel?: string;
  priceHistory: PricePoint[];
  comps: Comp[];
  conditionGrade?: string | null;
}

const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "1Y", "ALL"];
const TF_POINTS: Record<Timeframe, number> = {
  "1D": 2,
  "1W": 7,
  "1M": 12,
  "1Y": 24,
  ALL: 999,
};

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

export default function CardDetailHero({
  imageUrl,
  name,
  set,
  year,
  number,
  parallel,
  rawValue,
  gradedValue,
  gradedLabel = "Graded",
  priceHistory,
  comps,
}: CardDetailHeroProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  const [mode, setMode] = useState<Mode>("RAW");

  const displayedValue =
    mode === "GRADED" && gradedValue != null ? gradedValue : rawValue;

  const chartData = useMemo(() => {
    const base =
      priceHistory && priceHistory.length > 0
        ? priceHistory.slice(-TF_POINTS[timeframe])
        : [];
    const multiplier =
      mode === "GRADED" && gradedValue && rawValue
        ? gradedValue / Math.max(rawValue, 0.01)
        : 1;
    return base.map((p) => ({ ...p, price: p.price * multiplier }));
  }, [priceHistory, timeframe, mode, gradedValue, rawValue]);

  const change = useMemo(() => {
    if (chartData.length < 2) return { dollars: 0, pct: 0 };
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    const dollars = last - first;
    const pct = first > 0 ? (dollars / first) * 100 : 0;
    return { dollars, pct };
  }, [chartData]);

  const isGain = change.dollars >= 0;

  return (
    <div className="space-y-6">
      {/* Card image */}
      <FadeUp>
        <div className="relative mx-auto w-full max-w-[280px] pt-4">
          <div className="relative aspect-[5/7] mx-auto">
            <div
              aria-hidden
              className="absolute -inset-8 blur-2xl opacity-70"
              style={{
                background:
                  "radial-gradient(closest-side, hsl(var(--primary) / 0.18), transparent 70%)",
              }}
            />
            <img
              src={imageUrl}
              alt={name ? `${name} trading card` : "Trading card"}
              className="relative w-full h-full object-contain rounded-xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]"
              draggable={false}
            />
            {/* Soft reflection */}
            <div
              aria-hidden
              className="absolute left-0 right-0 top-full h-16 mx-auto w-[90%] rounded-full bg-black/60 blur-2xl opacity-60"
            />
          </div>
        </div>
      </FadeUp>

      {/* Metadata block */}
      <FadeUp delay={0.05}>
        <GlassCard padding="md" className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
              Card
            </p>
            <h1 className="text-2xl font-display font-bold text-foreground leading-tight mt-1">
              {name || "Untitled card"}
            </h1>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-border-subtle">
            <MetaItem label="Set" value={set} />
            <MetaItem label="Year" value={year} />
            <MetaItem label="Number" value={number} />
            <MetaItem label="Parallel" value={parallel} />
          </div>
        </GlassCard>
      </FadeUp>

      {/* Value + Raw/Graded toggle */}
      <FadeUp delay={0.1}>
        <GlassCard padding="md" className="space-y-5">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
              Market Value · {mode === "GRADED" ? gradedLabel : "Raw"}
            </p>
            <Value
              key={`${mode}-${displayedValue}`}
              amount={displayedValue}
              size="xl"
              tone="gold"
              decimals={2}
            />
            <div
              className={cn(
                "flex items-center gap-1.5 text-sm font-numeric font-semibold",
                isGain ? "text-gain" : "text-loss"
              )}
            >
              {isGain ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowDownRight className="w-4 h-4" />
              )}
              <span>
                {isGain ? "+" : "−"}${Math.abs(change.dollars).toFixed(2)}
              </span>
              <span className="text-muted-foreground font-normal">
                ({isGain ? "+" : ""}
                {change.pct.toFixed(2)}%) · {timeframe}
              </span>
            </div>
          </div>

          {/* Raw / Graded segmented control */}
          <div className="inline-flex w-full sm:w-auto rounded-full border border-border-subtle bg-background/40 p-1">
            {(["RAW", "GRADED"] as Mode[]).map((m) => {
              const disabled = m === "GRADED" && gradedValue == null;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 sm:flex-none px-5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-full transition-all",
                    mode === m
                      ? "bg-gradient-gold text-black shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    disabled && "opacity-40 cursor-not-allowed hover:text-muted-foreground"
                  )}
                >
                  {m === "GRADED" ? gradedLabel : "Raw"}
                </button>
              );
            })}
          </div>
        </GlassCard>
      </FadeUp>

      {/* Price history chart */}
      <FadeUp delay={0.15}>
        <GlassCard padding="md" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                Price History
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {mode === "GRADED" ? gradedLabel : "Raw"} · {timeframe}
              </p>
            </div>
            <div className="inline-flex rounded-full border border-border-subtle bg-background/40 p-0.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-full transition-all",
                    timeframe === tf
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[200px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No price history yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cardHeroGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={isGain ? "hsl(var(--gain))" : "hsl(var(--loss))"}
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="95%"
                        stopColor={isGain ? "hsl(var(--gain))" : "hsl(var(--loss))"}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={isGain ? "hsl(var(--gain))" : "hsl(var(--loss))"}
                    strokeWidth={2}
                    fill="url(#cardHeroGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>
      </FadeUp>

      {/* Recent sold comps */}
      <FadeUp delay={0.2}>
        <GlassCard padding="md" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
              Recent Sold Comps
            </p>
            <span className="text-[10px] text-muted-foreground">
              {comps.length} {comps.length === 1 ? "result" : "results"}
            </span>
          </div>
          {comps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No recent comps found yet. Try a re-scan.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle -mx-2">
              {comps.slice(0, 12).map((c, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 px-2 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {c.title || "Sold listing"}
                    </p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                      {c.source}
                      {c.date ? ` · ${c.date}` : ""}
                    </p>
                  </div>
                  <span className="font-numeric font-semibold text-sm text-foreground tabular-nums shrink-0">
                    ${c.price.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </FadeUp>
    </div>
  );
}
