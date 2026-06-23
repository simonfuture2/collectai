import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Layers, ShieldCheck, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Value } from "@/components/ui/value";
import { FadeUp } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

interface PortfolioCard {
  id: string;
  card_name: string | null;
  card_set: string | null;
  rarity: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  created_at: string;
  special_features?: string[] | null;
}

type Range = "1D" | "1W" | "1M" | "1Y" | "ALL";
const RANGES: Range[] = ["1D", "1W", "1M", "1Y", "ALL"];

const rangeWindowMs: Record<Range, number | null> = {
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
  ALL: null,
};

const midValue = (c: PortfolioCard) =>
  ((c.estimated_value_low || 0) + (c.estimated_value_high || 0)) / 2;

function buildSeries(cards: PortfolioCard[], range: Range) {
  const sorted = [...cards].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const points: { t: number; value: number }[] = [];
  let running = 0;
  for (const c of sorted) {
    running += midValue(c);
    points.push({ t: new Date(c.created_at).getTime(), value: running });
  }
  const now = Date.now();
  const window = rangeWindowMs[range];
  if (!window || points.length === 0) return points;
  const cutoff = now - window;
  const baseline =
    points.filter((p) => p.t <= cutoff).pop()?.value ?? 0;
  const windowed = points.filter((p) => p.t > cutoff);
  return [{ t: cutoff, value: baseline }, ...windowed, { t: now, value: running }];
}

function formatTick(t: number, range: Range) {
  const d = new Date(t);
  if (range === "1D") return d.toLocaleTimeString([], { hour: "numeric" });
  if (range === "1W" || range === "1M")
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}

export function PortfolioHero({ cards, loading }: { cards: PortfolioCard[]; loading?: boolean }) {
  const [range, setRange] = useState<Range>("1M");

  const { totalValue, todayChange, todayPct, series, totalCards, gradedCount, topCard } =
    useMemo(() => {
      const total = cards.reduce((s, c) => s + midValue(c), 0);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayCards = cards.filter(
        (c) => new Date(c.created_at).getTime() >= startOfToday.getTime()
      );
      const change = todayCards.reduce((s, c) => s + midValue(c), 0);
      const prev = total - change;
      const pct = prev > 0 ? (change / prev) * 100 : change > 0 ? 100 : 0;
      const isGraded = (c: PortfolioCard) =>
        (c.special_features || []).some((f) =>
          /(PSA|BGS|CGC|SGC|graded)/i.test(String(f))
        );
      const graded = cards.filter(isGraded).length;
      const top = cards.reduce<PortfolioCard | null>(
        (best, c) => (!best || midValue(c) > midValue(best) ? c : best),
        null
      );
      return {
        totalValue: total,
        todayChange: change,
        todayPct: pct,
        series: buildSeries(cards, range),
        totalCards: cards.length,
        gradedCount: graded,
        topCard: top,
      };
    }, [cards, range]);

  const isGain = todayChange >= 0;
  const tone: "gain" | "loss" = isGain ? "gain" : "loss";
  const ArrowIcon = isGain ? ArrowUpRight : ArrowDownRight;

  const recent = useMemo(
    () =>
      [...cards]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 12),
    [cards]
  );

  if (loading) return <PortfolioHeroSkeleton />;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <FadeUp>
        <GlassCard padding="lg" className="overflow-hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Total Collection Value
          </p>
          <div className="mt-3">
            <Value amount={totalValue} size="xl" tone="gold" decimals={2} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold",
                isGain ? "bg-[hsl(var(--gain)/0.12)] text-gain" : "bg-[hsl(var(--loss)/0.12)] text-loss"
              )}
            >
              <ArrowIcon className="h-4 w-4" />
              <Value
                amount={Math.abs(todayChange)}
                tone={tone}
                size="sm"
                animate={false}
                decimals={2}
                showSign={false}
              />
              <span className="opacity-70">·</span>
              <span className="font-numeric">
                {isGain ? "+" : "−"}
                {Math.abs(todayPct).toFixed(2)}%
              </span>
            </span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Today</span>
          </div>

          {/* Timeframe */}
          <div className="mt-6 flex items-center gap-1 rounded-full border border-border-subtle bg-black/20 p-1 w-fit">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold tracking-wider rounded-full transition-all",
                  r === range
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="mt-4 h-44 -mx-2">
            {series.length < 2 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Not enough history for this range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={isGain ? "hsl(var(--gain))" : "hsl(var(--loss))"}
                        stopOpacity={0.45}
                      />
                      <stop
                        offset="100%"
                        stopColor={isGain ? "hsl(var(--gain))" : "hsl(var(--loss))"}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    tickFormatter={(t) => formatTick(t, range)}
                    tick={{ fontSize: 10, fill: "hsl(var(--text-muted))" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={32}
                  />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(20,20,22,0.92)",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelFormatter={(t: number) =>
                      new Date(t).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    }
                    formatter={(v: number) => [`$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, "Value"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={isGain ? "hsl(var(--gain))" : "hsl(var(--loss))"}
                    strokeWidth={2}
                    fill="url(#chartFill)"
                    isAnimationActive
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>
      </FadeUp>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={Layers}
          label="Total Cards"
          value={<Value amount={totalCards} size="lg" decimals={0} animate />}
        />
        <StatCard
          icon={ShieldCheck}
          label="Graded"
          value={<Value amount={gradedCount} size="lg" decimals={0} animate />}
        />
        <StatCard
          icon={TrendingUp}
          label="Top Card"
          value={
            topCard ? (
              <Value amount={midValue(topCard)} size="lg" tone="gold" decimals={0} animate />
            ) : (
              <span className="text-2xl font-numeric font-semibold text-muted-foreground">—</span>
            )
          }
          sub={topCard?.card_name || undefined}
        />
      </div>

      {/* Recent scans */}
      {recent.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Recent Scans
            </h2>
            <Link
              to="/collection"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="-mx-3 sm:-mx-4 overflow-x-auto px-3 sm:px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-3 snap-x snap-mandatory">
              {recent.map((c) => (
                <Link
                  key={c.id}
                  to={`/card/${c.id}`}
                  className="group snap-start shrink-0 w-32"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-border-subtle bg-gradient-to-br from-[hsl(240_5%_14%)] to-[hsl(240_5%_8%)] shadow-glass transition-transform group-hover:-translate-y-1 group-active:scale-95">
                    <div
                      aria-hidden
                      className="absolute inset-0 opacity-30"
                      style={{ background: "var(--gradient-gold)" }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                        {c.rarity || c.card_set || "Card"}
                      </p>
                      <p className="text-xs font-semibold text-foreground truncate">
                        {c.card_name || "Unnamed"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-1.5 px-0.5">
                    <Value
                      amount={midValue(c)}
                      size="sm"
                      tone="gold"
                      decimals={0}
                      animate={false}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Layers;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <GlassCard padding="sm" hover="lift" className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground truncate">
          {label}
        </p>
      </div>
      <div className="mt-2">{value}</div>
      {sub && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate" title={sub}>
          {sub}
        </p>
      )}
    </GlassCard>
  );
}

function PortfolioHeroSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <GlassCard padding="lg">
        <div className="h-3 w-40 rounded bg-white/5" />
        <div className="mt-4 h-14 w-64 rounded bg-white/10" />
        <div className="mt-4 h-6 w-32 rounded bg-white/5" />
        <div className="mt-6 h-7 w-56 rounded-full bg-white/5" />
        <div className="mt-4 h-44 w-full rounded-xl bg-white/5" />
      </GlassCard>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <GlassCard key={i} padding="sm">
            <div className="h-3 w-16 rounded bg-white/5" />
            <div className="mt-3 h-7 w-20 rounded bg-white/10" />
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

export default PortfolioHero;
