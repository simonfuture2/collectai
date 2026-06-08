import { ExternalLink, TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, Award, ArrowRightCircle, BarChart3, Clock } from "lucide-react";

interface SourceRow {
  source: string;
  median?: number;
  low?: number;
  high?: number;
  count?: number;
  recencyDays?: number;
  prices?: number[];
}

interface CrossReference {
  priceChartingValue?: number;
  ebaySoldMedian?: number;
  agreementPct?: number;
  agree?: boolean;
}

interface PriceTrend {
  status?: "ok" | "insufficient_history" | string;
  direction?: "up" | "down" | "flat";
  change30dPct?: number | null;
  change90dPct?: number | null;
  sampleSize?: number;
  source?: string;
}

interface GradingEdge {
  service?: string;
  rawValue?: number;
  mostLikelyGrade?: string | number;
  valueAtMostLikely?: number;
  nextGrade?: string | number;
  valueAtNextGrade?: number;
  gradingCost?: number;
  turnaroundTime?: string;
  netEvAtMostLikely?: number;
  netEvAtNextGrade?: number;
  verdict?: "worth_it" | "borderline" | "not_worth_it";
  verdictReason?: string;
}

interface Recommendation {
  action?: "buy" | "sell" | "hold" | "grade_then_sell";
  label?: string;
  rationale?: string;
  disclaimer?: string;
}

interface MarketEvidenceProps {
  sources?: SourceRow[];
  crossReference?: CrossReference;
  notableSales?: string[];
  cardSearchQuery?: string;
  priceTrend?: PriceTrend;
  gradingEdge?: GradingEdge;
  recommendation?: Recommendation;
  confidenceBand?: "high" | "medium" | "low" | string;
  confidenceExplanation?: string;
  confidenceReason?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  pricecharting: "PriceCharting",
  ebay_sold: "eBay (sold)",
  ebay_active: "eBay (active)",
  tcgplayer: "TCGPlayer",
  blended: "Blended headline",
};

function fmtMoney(n?: number | null) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function priceFromTitle(t: string): { title: string; price?: number } {
  const m = t.match(/\$\s?([\d,]+(?:\.\d+)?)/);
  const price = m ? parseFloat(m[1].replace(/,/g, "")) : undefined;
  return { title: t.replace(/\s+\$\s?[\d,]+(?:\.\d+)?\s*$/, "").trim(), price };
}

function actionStyles(action?: string) {
  switch (action) {
    case "buy":
      return { cls: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30", icon: TrendingUp };
    case "sell":
      return { cls: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", icon: TrendingDown };
    case "grade_then_sell":
      return { cls: "bg-primary/10 text-primary border-primary/30", icon: Award };
    default:
      return { cls: "bg-muted text-muted-foreground border-border", icon: Minus };
  }
}

const MarketEvidence = ({
  sources = [],
  crossReference,
  notableSales = [],
  cardSearchQuery,
  priceTrend,
  gradingEdge,
  recommendation,
  confidenceBand,
  confidenceExplanation,
  confidenceReason,
}: MarketEvidenceProps) => {
  const ebaySold = sources.find((s) => s.source === "ebay_sold");
  const pc = sources.find((s) => s.source === "pricecharting");
  const tcg = sources.find((s) => s.source === "tcgplayer");
  const ebayActive = sources.find((s) => s.source === "ebay_active");
  const orderedSources = [pc, ebaySold, ebayActive, tcg].filter(Boolean) as SourceRow[];

  const xr = crossReference;
  const xrHasBoth = xr?.priceChartingValue && xr?.ebaySoldMedian;

  // Top 3–5 comp titles with prices
  const comps = notableSales
    .map(priceFromTitle)
    .filter((c) => c.title)
    .slice(0, 5);

  const freshnessDays = ebaySold?.recencyDays;
  const ebaySearchUrl = cardSearchQuery
    ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(cardSearchQuery)}&LH_Sold=1&LH_Complete=1`
    : null;

  const rec = recommendation;
  const recStyle = actionStyles(rec?.action);
  const RecIcon = recStyle.icon;

  const trendDirIcon = priceTrend?.direction === "up" ? TrendingUp : priceTrend?.direction === "down" ? TrendingDown : Minus;
  const TrendIcon = trendDirIcon;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg">Market Evidence</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Where this pricing comes from — independent sources kept separate and cross-checked.
      </p>

      {/* Recommendation headline */}
      {rec?.action && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${recStyle.cls}`}>
          <RecIcon className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide opacity-70">Recommendation</p>
            <p className="font-display font-bold text-lg leading-tight">{rec.label || rec.action}</p>
            {rec.rationale && <p className="text-sm mt-1 opacity-90">{rec.rationale}</p>}
            {rec.disclaimer && (
              <p className="text-[11px] mt-2 opacity-70 italic">{rec.disclaimer}</p>
            )}
          </div>
        </div>
      )}

      {/* Per-source values grid */}
      {orderedSources.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {orderedSources.map((s) => (
            <div key={s.source} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {SOURCE_LABEL[s.source] || s.source}
                </span>
                {typeof s.count === "number" && s.count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {s.count} comp{s.count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <p className="text-xl font-display font-bold text-foreground mt-1">
                {fmtMoney(s.median)}
              </p>
              {(s.low !== undefined || s.high !== undefined) && (
                <p className="text-[11px] text-muted-foreground">
                  {fmtMoney(s.low)} – {fmtMoney(s.high)}
                </p>
              )}
              {typeof s.recencyDays === "number" && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last ~{s.recencyDays} days
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cross-source agreement */}
      {xrHasBoth && (
        <div
          className={`flex items-start gap-3 p-3 rounded-xl border ${
            xr!.agree
              ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
              : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
          }`}
        >
          {xr!.agree ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div className="text-xs">
            <p className="font-semibold">
              Cross-source {xr!.agree ? "agreement" : "disagreement"}
              {typeof xr!.agreementPct === "number" && ` (${xr!.agreementPct.toFixed(0)}% gap)`}
            </p>
            <p className="opacity-80 mt-0.5">
              PriceCharting {fmtMoney(xr!.priceChartingValue)} vs. eBay sold median {fmtMoney(xr!.ebaySoldMedian)}.
              {xr!.agree
                ? " Two independent sources line up — high evidentiary weight."
                : " Sources diverge — value range widened accordingly."}
            </p>
          </div>
        </div>
      )}

      {/* Top eBay sold comps */}
      {comps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Recent eBay sold comps</p>
            {typeof freshnessDays === "number" && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last {freshnessDays} days
              </span>
            )}
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {comps.map((c, i) => {
              const url = ebaySearchUrl;
              return (
                <li key={i} className="p-3 flex items-start gap-3 text-sm">
                  <span className="text-muted-foreground text-xs mt-0.5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-foreground">{c.title}</p>
                  </div>
                  {c.price !== undefined && (
                    <span className="font-semibold text-foreground shrink-0">{fmtMoney(c.price)}</span>
                  )}
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary shrink-0"
                      aria-label="View source on eBay"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Price trend */}
      {priceTrend && (
        <div className="rounded-xl border border-border p-3 flex items-start gap-3">
          <TrendIcon
            className={`w-5 h-5 mt-0.5 shrink-0 ${
              priceTrend.direction === "up"
                ? "text-green-600"
                : priceTrend.direction === "down"
                ? "text-red-600"
                : "text-muted-foreground"
            }`}
          />
          <div className="text-xs flex-1">
            <p className="font-semibold text-foreground">Price trend</p>
            {priceTrend.status === "ok" ? (
              <p className="text-muted-foreground mt-0.5">
                {priceTrend.direction === "up" ? "Trending up" : priceTrend.direction === "down" ? "Trending down" : "Flat"} —{" "}
                30d {priceTrend.change30dPct ?? "?"}% / 90d {priceTrend.change90dPct ?? "?"}%
                {priceTrend.sampleSize ? ` · ${priceTrend.sampleSize} points` : ""}
                {priceTrend.source ? ` · ${SOURCE_LABEL[priceTrend.source] || priceTrend.source}` : ""}
              </p>
            ) : (
              <p className="text-muted-foreground mt-0.5">
                Insufficient price history yet — trend will appear after a few scans.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Grading-edge headline */}
      {gradingEdge?.verdict && (
        <div className="rounded-xl border border-border p-3 flex items-start gap-3">
          <Award className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" />
          <div className="text-xs flex-1">
            <p className="font-semibold text-foreground">
              Grading edge:{" "}
              {gradingEdge.verdict === "worth_it"
                ? "Worth grading"
                : gradingEdge.verdict === "borderline"
                ? "Borderline"
                : "Not worth grading"}
            </p>
            <p className="text-muted-foreground mt-0.5">
              Raw {fmtMoney(gradingEdge.rawValue)} → {gradingEdge.service} {gradingEdge.mostLikelyGrade}{" "}
              {fmtMoney(gradingEdge.valueAtMostLikely)} (net EV{" "}
              {fmtMoney(gradingEdge.netEvAtMostLikely)} after ~{fmtMoney(gradingEdge.gradingCost)} fee).
            </p>
            {gradingEdge.verdictReason && (
              <p className="text-muted-foreground mt-0.5">{gradingEdge.verdictReason}</p>
            )}
          </div>
        </div>
      )}

      {/* Explainable confidence line */}
      {(confidenceExplanation || confidenceReason) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border">
          <ArrowRightCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold text-foreground">
              Confidence{confidenceBand ? `: ${confidenceBand}` : ""}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {confidenceExplanation || confidenceReason}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketEvidence;
