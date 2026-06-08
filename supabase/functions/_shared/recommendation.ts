// Deterministic recommendation engine.
// Inputs: priceTrend, gradingEdge, confidenceBand. Output: one of
// "buy" | "sell" | "hold" | "grade_then_sell" with a one-line rationale.
// Informational only — not financial advice.

export type RecommendationAction = "buy" | "sell" | "hold" | "grade_then_sell";

export interface RecommendationInput {
  trend?: {
    status?: string;
    direction?: "up" | "down" | "flat";
    change30dPct?: number | null;
    change90dPct?: number | null;
  } | null;
  gradingEdge?: {
    verdict?: "worth_it" | "borderline" | "not_worth_it";
    netEvAtMostLikely?: number | null;
    rawValue?: number | null;
    mostLikelyGrade?: string | number | null;
    service?: string | null;
  } | null;
  confidenceBand?: "high" | "medium" | "low" | string | null;
}

export interface Recommendation {
  action: RecommendationAction;
  label: string;
  rationale: string;
  signals: {
    trendDirection?: string | null;
    change30dPct?: number | null;
    gradingVerdict?: string | null;
    netEv?: number | null;
    confidenceBand?: string | null;
  };
  disclaimer: string;
}

const DISCLAIMER =
  "Informational only — not financial advice. Markets fluctuate; do your own research.";

export function buildRecommendation(input: RecommendationInput): Recommendation {
  const band = (input.confidenceBand || "low").toLowerCase();
  const trendDir = input.trend?.direction ?? null;
  const trendOk = input.trend?.status === "ok";
  const ch30 = input.trend?.change30dPct ?? null;
  const ch90 = input.trend?.change90dPct ?? null;
  const verdict = input.gradingEdge?.verdict ?? null;
  const netEv = input.gradingEdge?.netEvAtMostLikely ?? null;
  const service = input.gradingEdge?.service ?? "PSA";
  const grade = input.gradingEdge?.mostLikelyGrade ?? null;

  // Rule precedence:
  // 1) Low confidence → hold (we don't act on weak signals).
  // 2) Grading is clearly worth it → grade then sell.
  // 3) Strong downtrend + medium/high confidence → sell.
  // 4) Strong uptrend + medium/high confidence + no grading edge → buy.
  // 5) Otherwise → hold.

  let action: RecommendationAction = "hold";
  let rationale = "";

  const strongDown = trendOk && (ch30 !== null && ch30 <= -5) || (ch90 !== null && ch90 <= -10);
  const strongUp = trendOk && ((ch30 !== null && ch30 >= 5) || (ch90 !== null && ch90 >= 10));

  if (band === "low") {
    action = "hold";
    rationale = `Hold — confidence is low; signals aren't strong enough to act on.`;
  } else if (verdict === "worth_it") {
    action = "grade_then_sell";
    const evStr = netEv !== null ? ` (~$${netEv.toFixed(0)} net EV at ${service} ${grade ?? ""})`.trim() : "";
    rationale = `Grade then sell — projected grading return exceeds raw value${evStr}; ${band} confidence.`;
  } else if (strongDown && trendDir === "down") {
    action = "sell";
    rationale = `Sell — 30d ${ch30 ?? "?"}% / 90d ${ch90 ?? "?"}% downtrend with ${band} confidence; no grading edge.`;
  } else if (strongUp && trendDir === "up" && verdict !== "borderline") {
    action = "buy";
    rationale = `Buy — 30d ${ch30 ?? "?"}% / 90d ${ch90 ?? "?"}% uptrend with ${band} confidence; raw market favored over grading.`;
  } else if (verdict === "borderline") {
    action = "hold";
    rationale = `Hold — grading EV is borderline and trend (${trendDir ?? "n/a"}) doesn't strongly favor a side.`;
  } else {
    action = "hold";
    const trendNote = trendOk ? `trend ${trendDir} (30d ${ch30 ?? "?"}%)` : "insufficient price history";
    rationale = `Hold — ${trendNote}, grading not worth it, ${band} confidence.`;
  }

  const labelMap: Record<RecommendationAction, string> = {
    buy: "Buy",
    sell: "Sell",
    hold: "Hold",
    grade_then_sell: "Grade, then sell",
  };

  return {
    action,
    label: labelMap[action],
    rationale,
    signals: {
      trendDirection: trendDir,
      change30dPct: ch30,
      gradingVerdict: verdict,
      netEv,
      confidenceBand: band,
    },
    disclaimer: DISCLAIMER,
  };
}
