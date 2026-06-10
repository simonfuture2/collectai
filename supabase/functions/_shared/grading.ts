// Single source of truth for the pre-grade rubric.
//
// The overall pre-grade is the LOWEST of the four condition dimensions
// (centering / corners / edges / surface) — graders punish the worst flaw, not
// the average — presented as a two-grade range with the limiting dimension(s)
// named, never a single certain grade. Used by collectai-grade and the full
// analysis engine; the frontend renders the emitted `preGrade` rather than
// recomputing it.

export type GradeDimension = "centering" | "corners" | "edges" | "surface";

export interface PreGrade {
  low: number;
  high: number;
  band: string;
  limitingDimensions: GradeDimension[];
  label: string;
}

export function gradeBandLabel(score: number): string {
  if (score >= 10) return "Gem Mint";
  if (score >= 9) return "Mint";
  if (score >= 7) return "Near Mint";
  if (score >= 5) return "Excellent";
  if (score >= 3) return "Very Good";
  return "Poor";
}

export function groundedPreGrade(scores: Partial<Record<GradeDimension, number>>): PreGrade | null {
  const dims: GradeDimension[] = ["centering", "corners", "edges", "surface"];
  const present = dims
    .map((d) => [d, scores[d]] as const)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v as number)) as Array<[GradeDimension, number]>;
  if (present.length === 0) return null;

  const min = Math.min(...present.map(([, v]) => v));
  const limitingDimensions = present.filter(([, v]) => v === min).map(([d]) => d);
  // Always a two-grade range to express single-photo uncertainty; cap at 10.
  const low = min >= 10 ? 9 : min;
  const high = Math.min(10, min + 1);
  const band = gradeBandLabel(min);
  const allTied = limitingDimensions.length === present.length;
  const label = allTied
    ? `${band} ${low}–${high} (even across all dimensions)`
    : `${band} ${low}–${high} (limited by ${limitingDimensions.join(" & ")})`;
  return { low, high, band, limitingDimensions, label };
}
