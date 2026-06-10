// Single source of truth for market-price confidence.
//
// Computes a 0–100 data-quality + cross-source confidence score from the
// aggregated market data, and maps it to a high/medium/low band with a
// human-readable explanation. Used by BOTH the full analysis engine
// (analyze-card / enrich-card / quick-scan) and the standalone price endpoint
// (collectai-price) so every pricing path reports confidence identically.
//
// Factors (weights): data sufficiency 30% · price dispersion 25% ·
// recency 20% · PriceCharting-vs-eBay cross-source agreement 25%.

import type { AggregatedMarketData } from "./marketData.ts";

export interface ConfidenceInputs {
  // Optional signals only the full analysis engine has; safe defaults otherwise.
  verifierDisagreementPct?: number;
  identificationUncertain?: boolean;
  variantConfidence?: "high" | "medium" | "low";
}

export interface ConfidenceResult {
  band: "high" | "medium" | "low";
  score: number; // 0–100
  explanation: string; // e.g. "Medium — 4 sold comps (limited), moderate spread (CV 18%)."
  reasons: string[];
}

export function computeMarketConfidence(
  aggregated: AggregatedMarketData,
  inputs: ConfidenceInputs = {},
): ConfidenceResult {
  const { verifierDisagreementPct = 0, identificationUncertain = false, variantConfidence = "high" } = inputs;

  const ebaySold = aggregated.sources.find((s) => s.source === "ebay_sold");
  const soldPrices = ebaySold?.prices || [];
  const soldCount = soldPrices.length;
  const recencyDays = ebaySold?.recencyDays ?? 999;
  const reasons: string[] = [];

  // (a) Data sufficiency (30%)
  let suffPts = 0;
  if (soldCount >= 6) { suffPts = 30; reasons.push(`${soldCount} recent sold comps`); }
  else if (soldCount >= 3) { suffPts = 18; reasons.push(`${soldCount} sold comps (limited)`); }
  else if (soldCount >= 1) { suffPts = 8; reasons.push(`only ${soldCount} sold comp${soldCount === 1 ? "" : "s"}`); }
  else { suffPts = 0; reasons.push("no eBay sold comps"); }

  // (b) Dispersion (25%) — coefficient of variation of sold comps
  let dispPts = 0;
  let cv = 0;
  if (soldCount >= 2) {
    const mean = soldPrices.reduce((a, b) => a + b, 0) / soldCount;
    const variance = soldPrices.reduce((s, p) => s + (p - mean) ** 2, 0) / soldCount;
    const sd = Math.sqrt(variance);
    cv = mean > 0 ? sd / mean : 0;
    if (cv <= 0.1) { dispPts = 25; reasons.push(`tight comp spread (CV ${(cv * 100).toFixed(0)}%)`); }
    else if (cv <= 0.2) { dispPts = 18; reasons.push(`moderate spread (CV ${(cv * 100).toFixed(0)}%)`); }
    else if (cv <= 0.35) { dispPts = 10; reasons.push(`wide spread (CV ${(cv * 100).toFixed(0)}%)`); }
    else { dispPts = 3; reasons.push(`very wide spread (CV ${(cv * 100).toFixed(0)}%)`); }
  }

  // (c) Recency (20%)
  let recPts = 0;
  if (soldCount > 0) {
    if (recencyDays <= 14) { recPts = 20; reasons.push("fresh comps (≤14d)"); }
    else if (recencyDays <= 30) { recPts = 14; reasons.push("comps ~30d old"); }
    else if (recencyDays <= 60) { recPts = 7; reasons.push("comps ~60d old"); }
    else { recPts = 2; reasons.push(`stale comps (~${recencyDays}d)`); }
  }

  // (d) Cross-source agreement (25%) — PriceCharting vs eBay sold median
  let xPts = 0;
  const xRef = aggregated.crossReference;
  if (xRef.priceChartingValue !== undefined && xRef.ebaySoldMedian !== undefined) {
    if (xRef.agree) { xPts = 25; reasons.push(`PriceCharting agrees within ${(100 - (xRef.agreementPct ?? 0)).toFixed(0)}%`); }
    else { xPts = 4; reasons.push(`PriceCharting diverges from eBay (${xRef.agreementPct ?? 0}% agreement)`); }
  } else if (xRef.priceChartingValue !== undefined || xRef.ebaySoldMedian !== undefined) {
    xPts = 10;
    reasons.push("only one independent source available");
  }

  let score = suffPts + dispPts + recPts + xPts;

  if (verifierDisagreementPct > 40) {
    score = Math.max(0, score - 15);
    reasons.push(`verifier models disagree ${verifierDisagreementPct}% (price sanity check)`);
  }

  if (soldCount === 0 && !(xRef.priceChartingValue && xRef.priceChartingValue > 0)) {
    score = Math.min(score, 35);
  }

  if (identificationUncertain) {
    score = Math.min(score, 74);
    reasons.push(
      variantConfidence !== "high"
        ? `variant confidence ${variantConfidence}`
        : "identification uncertain vs comps",
    );
  }

  let band: "high" | "medium" | "low";
  if (score >= 75) band = "high";
  else if (score >= 45) band = "medium";
  else band = "low";

  const explanation = `${band[0].toUpperCase()}${band.slice(1)} — ${reasons.join(", ") || "insufficient data"}.`;

  return { band, score: Math.round(score), explanation, reasons };
}
