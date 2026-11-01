// PriceCharting-first valuation rules (pure, no I/O).
// When PriceCharting matched, its price IS the headline value; eBay/TCGplayer
// are only a cross-check that can lower confidence and add a note.

export type LadderKey =
  | "ungraded" | "grade1" | "grade2" | "grade3" | "grade4" | "grade5" | "grade6"
  | "grade7" | "grade8" | "grade9" | "grade9_5" | "psa10" | "bgs10" | "cgc10"
  | "sgc10" | "cgc10_pristine" | "bgs10_black" | "tag10" | "ace10";
export type Ladder = Partial<Record<LadderKey, number>>;
export type Confidence = "high" | "medium" | "low";

export const NO_PC_GRADE_NOTE = "No PriceCharting data for this grade";
export const PC_RANGE_PCT = 0.10;
export const CROSS_CHECK_GAP_PCT = 25;

/** Map a slab (or raw when company/grade missing) to its PriceCharting ladder key; null = no rung. */
export function rungForGrade(company?: string | null, grade?: number | string | null, label?: string | null): LadderKey | null {
  const co = String(company || "").trim().toUpperCase();
  const g = grade === null || grade === undefined || grade === "" ? NaN : Number(grade);
  if (!co || co === "RAW" || co === "UNGRADED" || !Number.isFinite(g)) return "ungraded";
  const lbl = String(label || "").toLowerCase();
  if (g === 10) {
    if (co === "PSA") return "psa10";
    if (co === "BGS" || co === "BECKETT") return /black/.test(lbl) ? "bgs10_black" : "bgs10";
    if (co === "CGC") return /pristine/.test(lbl) ? "cgc10_pristine" : "cgc10";
    if (co === "SGC") return "sgc10";
    if (co === "TAG") return "tag10";
    if (co === "ACE") return "ace10";
    return null;
  }
  if (g === 9.5) return "grade9_5";
  if (Number.isInteger(g) && g >= 1 && g <= 9) return (`grade${g}`) as LadderKey;
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function pcHeadline(ladder: Ladder | null | undefined, rung: LadderKey | null) {
  if (!ladder || !rung) return null;
  const v = ladder[rung];
  if (!(typeof v === "number" && v > 0)) return null;
  return { value: v, low: round2(v * (1 - PC_RANGE_PCT)), high: round2(v * (1 + PC_RANGE_PCT)) };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median of available market medians vs PriceCharting. Null when no market data. */
export function crossCheck(pcValue: number, ...marketMedians: Array<number | null | undefined>) {
  const vals = marketMedians.filter((x): x is number => typeof x === "number" && x > 0);
  if (!vals.length || !(pcValue > 0)) return null;
  const med = median(vals);
  const gapPct = Math.round((Math.abs(med - pcValue) / pcValue) * 100);
  return { median: round2(med), gapPct, flagged: gapPct > CROSS_CHECK_GAP_PCT };
}

export function crossCheckNote(c: { median: number; gapPct: number }): string {
  return `Recent eBay sales median $${c.median.toFixed(2)} differs by ${c.gapPct}% from PriceCharting`;
}

export function lowerConfidence(c: string | null | undefined): Confidence {
  if (c === "high") return "medium";
  return "low";
}

/** Graded estimates built ONLY from the ladder; missing rungs carry a note instead of a number. */
export function ladderGradedEstimates(ladder: Ladder) {
  const row = (k: LadderKey) =>
    typeof ladder[k] === "number" ? { value: ladder[k] as number } : { value: null, note: NO_PC_GRADE_NOTE };
  return {
    psa: { "7": row("grade7"), "8": row("grade8"), "9": row("grade9"), "10": row("psa10") },
    bgs: { "9.5": row("grade9_5"), "10": row("bgs10"), "10 Black": row("bgs10_black") },
    cgc: { "10": row("cgc10"), "Pristine 10": row("cgc10_pristine") },
    sgc: { "10": row("sgc10") },
    tag: { "10": row("tag10") },
    ace: { "10": row("ace10") },
  };
}

export const LIVE_REFRESH_DAYS = 7;

/** Live-only cards refresh when never synced or synced at least 7 days ago. */
export function liveRefreshDue(pcSyncedAt: string | null | undefined, now = new Date()): boolean {
  if (!pcSyncedAt) return true;
  return now.getTime() - new Date(pcSyncedAt).getTime() >= LIVE_REFRESH_DAYS * 86_400_000;
}

/** Mirrors pc_refresh_cards_from_catalog(): which saved cards get a new value from the ladder. */
export function refreshDecision(
  card: { analysis_depth?: string | null; ai_analysis?: Record<string, unknown> | null },
  ladder: Ladder,
) {
  const eligible = card.analysis_depth === "price_only" || card.ai_analysis?.valuationSource === "pricecharting";
  if (!eligible) return { revalue: false as const };
  const rung = ((card.ai_analysis?.pcRung as string) || "ungraded") as LadderKey;
  const head = pcHeadline(ladder, rung);
  return head ? { revalue: true as const, rung, ...head } : { revalue: false as const };
}
