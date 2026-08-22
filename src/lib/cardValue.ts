/**
 * Single source of truth for how a card's market value is resolved.
 *
 * For a confirmed graded slab the stored estimated_value_low/high columns can
 * still hold the raw-card range (e.g. the value from before pairing), so we
 * re-resolve using the graded evidence with this precedence:
 *   1. grader tier value at the confirmed grade (ai_analysis.gradedValueEstimates)
 *   2. eBay graded average sold price
 *   3. eBay graded low/high midpoint
 *   4. stored estimated range midpoint
 */

export interface ValueResolvableCard {
  estimated_value_low?: number | null;
  estimated_value_high?: number | null;
  grading_company?: string | null;
  grade_numeric?: number | string | null;
  condition_grade?: string | null;
  ebay_recent_sales?: unknown;
  ai_analysis?: unknown;
}

export interface ResolvedCardValue {
  /** Value to display everywhere for this card. */
  value: number;
  /** True when the card is a confirmed graded slab. */
  isSlab: boolean;
  /** e.g. "BGS 8" for confirmed slabs, else null. */
  gradeLabel: string | null;
  /** Human readable provenance for the number. */
  source: "graded comps" | "recent eBay sold comps" | "stored estimate";
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function resolveCardValue(card: ValueResolvableCard): ResolvedCardValue {
  const storedMid =
    ((num(card.estimated_value_low) || 0) + (num(card.estimated_value_high) || 0)) / 2;

  const analysis = (card.ai_analysis ?? null) as any;
  const company: string | null =
    analysis?.confirmedGrade?.company ?? card.grading_company ?? null;
  const numericRaw =
    analysis?.confirmedGrade?.grade_numeric ??
    (card.grade_numeric != null ? card.grade_numeric : null);
  const numeric = numericRaw != null ? num(numericRaw) : NaN;

  const isSlab = !!company && Number.isFinite(numeric);
  if (!isSlab) {
    return { value: storedMid, isSlab: false, gradeLabel: null, source: "stored estimate" };
  }

  const key = String(company).toLowerCase();
  const tier = analysis?.gradedValueEstimates?.[key] ?? {};
  const atGrade = num(tier?.valueAtGrade);

  const ebay = (analysis?.ebayRecentSales ?? card.ebay_recent_sales ?? null) as any;
  const ebayAvg = num(ebay?.averagePrice);
  const ebayLow = num(ebay?.lowPrice);
  const ebayHigh = num(ebay?.highPrice);
  const ebayMid = ebayLow > 0 && ebayHigh > 0 ? (ebayLow + ebayHigh) / 2 : NaN;

  let value = storedMid;
  let source: ResolvedCardValue["source"] = "stored estimate";
  if (atGrade > 0) {
    value = atGrade;
    source = "graded comps";
  } else if (ebayAvg > 0) {
    value = ebayAvg;
    source = "recent eBay sold comps";
  } else if (ebayMid > 0) {
    value = ebayMid;
    source = "recent eBay sold comps";
  }

  return {
    value,
    isSlab: true,
    gradeLabel: `${String(company).toUpperCase()} ${numeric}`,
    source,
  };
}
