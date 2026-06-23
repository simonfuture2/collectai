import { motion } from "framer-motion";
import { Sparkles, TrendingUp, TrendingDown, Minus, ShieldCheck, Gem, AlertTriangle, Lightbulb } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

interface AIAnalysisCardProps {
  analysis?: {
    investmentOutlook?: string;
    additionalNotes?: string;
    priceFactors?: string[];
    valueTrend?: "rising" | "stable" | "falling" | "unknown";
    trendReason?: string;
    recommendation?: {
      action?: string;
      label?: string;
      rationale?: string;
      disclaimer?: string;
    };
    gradingEdge?: {
      verdict?: string;
      verdictReason?: string;
    };
    confidenceExplanation?: string;
  } | null;
}

const trendMeta: Record<string, { icon: any; tone: string; label: string }> = {
  rising:  { icon: TrendingUp,   tone: "text-gain",             label: "Rising" },
  stable:  { icon: Minus,        tone: "text-muted-foreground", label: "Stable" },
  falling: { icon: TrendingDown, tone: "text-loss",             label: "Falling" },
  unknown: { icon: Minus,        tone: "text-muted-foreground", label: "Unclear" },
};

// Split paragraphs from a long string
const toParagraphs = (s?: string) =>
  (s || "")
    .split(/\n{2,}|(?<=\.)\s{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

export function AIAnalysisCard({ analysis }: AIAnalysisCardProps) {
  if (!analysis) return null;

  const verdict =
    analysis.recommendation?.label ||
    analysis.recommendation?.rationale ||
    analysis.investmentOutlook ||
    "";

  const factors = (analysis.priceFactors || []).filter(Boolean).slice(0, 6);
  const trendKey = (analysis.valueTrend as keyof typeof trendMeta) || "unknown";
  const trend = trendMeta[trendKey] || trendMeta.unknown;
  const TrendIcon = trend.icon;

  const notes = toParagraphs(analysis.additionalNotes);
  const rationale =
    analysis.recommendation?.rationale &&
    analysis.recommendation.rationale !== verdict
      ? analysis.recommendation.rationale
      : null;

  // Nothing meaningful to show
  if (!verdict && !factors.length && !analysis.trendReason && !notes.length && !rationale) {
    return null;
  }

  return (
    <GlassCard padding="lg" className="relative overflow-hidden">
      {/* Subtle gold accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-30"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--accent) / 0.6), transparent 70%)",
        }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/30">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <motion.span
              className="absolute inset-0 rounded-full ring-1 ring-accent/40"
              animate={{ opacity: [0.2, 0.6, 0.2], scale: [1, 1.15, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            AI Analysis
          </span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-accent/80">
          Powered by Claude
        </span>
      </div>

      {/* Verdict — pulled to top, larger */}
      {verdict && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="relative font-display text-xl md:text-2xl leading-snug tracking-tight mb-6"
        >
          <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
            {verdict}
          </span>
        </motion.p>
      )}

      {/* Structured rows */}
      <div className="relative space-y-3">
        {analysis.valueTrend && analysis.valueTrend !== "unknown" && (
          <Row
            delay={0.1}
            icon={<TrendIcon className={`w-4 h-4 ${trend.tone}`} />}
            label="Market Trend"
            value={trend.label}
            valueClass={trend.tone}
            detail={analysis.trendReason}
          />
        )}

        {factors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="rounded-xl border border-border-subtle bg-background/30 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Gem className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Value Drivers
              </span>
            </div>
            <ul className="space-y-1.5">
              {factors.map((f, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.22 + i * 0.05 }}
                  className="flex items-start gap-2 text-sm text-foreground/90"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span>{f}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}

        {analysis.gradingEdge?.verdictReason && (
          <Row
            delay={0.26}
            icon={<ShieldCheck className="w-4 h-4 text-primary" />}
            label="Grading Edge"
            value={
              analysis.gradingEdge.verdict === "worth_it"
                ? "Worth It"
                : analysis.gradingEdge.verdict === "not_worth_it"
                ? "Skip"
                : "Borderline"
            }
            detail={analysis.gradingEdge.verdictReason}
          />
        )}

        {rationale && (
          <Row
            delay={0.3}
            icon={<Lightbulb className="w-4 h-4 text-accent" />}
            label="Rationale"
            detail={rationale}
          />
        )}

        {notes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.34 }}
            className="space-y-2 pt-1"
          >
            {notes.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </motion.div>
        )}

        {analysis.recommendation?.disclaimer && (
          <div className="flex items-start gap-2 pt-2 text-[11px] text-muted-foreground/80">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{analysis.recommendation.disclaimer}</span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function Row({
  icon,
  label,
  value,
  valueClass,
  detail,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  valueClass?: string;
  detail?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex items-start gap-3 rounded-xl border border-border-subtle bg-background/30 p-3.5"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/60">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </span>
          {value && (
            <span className={`text-xs font-semibold ${valueClass || "text-foreground"}`}>
              {value}
            </span>
          )}
        </div>
        {detail && (
          <p className="mt-1 text-sm leading-relaxed text-foreground/85">{detail}</p>
        )}
      </div>
    </motion.div>
  );
}
