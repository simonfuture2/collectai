import { Target, CheckCircle2, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

interface GradeAccuracy {
  hasComparison?: boolean;
  predictedGrade?: number | null;
  actualGrade?: number | null;
  actualCompany?: string | null;
  deltaGrades?: number;
  withinHalf?: boolean;
  withinOne?: boolean;
  accuracyScore?: number | null;
  verdict?: string;
  predictedValueMid?: number | null;
}

interface Props {
  accuracy: GradeAccuracy;
  actualValueMid?: number | null;
  /** e.g. "BGS 8" — present when the card is a confirmed slab */
  gradeLabel?: string | null;
  /** e.g. "recent eBay sold comps" */
  valueSource?: string | null;
}


function verdictTone(score: number | null | undefined) {
  if (score == null) return { bar: "bg-muted-foreground/40", chip: "bg-muted text-muted-foreground" };
  if (score >= 90) return { bar: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-500" };
  if (score >= 70) return { bar: "bg-amber-400", chip: "bg-amber-400/15 text-amber-400" };
  return { bar: "bg-red-500", chip: "bg-red-500/15 text-red-500" };
}

export default function AIAccuracyCard({ accuracy, actualValueMid, gradeLabel, valueSource }: Props) {
  if (!accuracy) return null;
  const {
    predictedGrade,
    actualGrade,
    actualCompany,
    accuracyScore,
    verdict,
    deltaGrades,
    predictedValueMid,
    hasComparison,
  } = accuracy;

  const tone = verdictTone(accuracyScore);
  const valueDeltaPct =
    predictedValueMid != null && actualValueMid != null && predictedValueMid > 0
      ? ((actualValueMid - predictedValueMid) / predictedValueMid) * 100
      : null;

  return (
    <GlassCard className="p-5 space-y-4 border-primary/20">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold">AI vs Reality</h3>
        {hasComparison && accuracyScore != null && (
          <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${tone.chip}`}>
            {accuracyScore}% accurate
          </span>
        )}
      </div>

      {!hasComparison ? (
        <p className="text-sm text-muted-foreground">
          We saved the confirmed slab grade. There wasn't a prior AI pre-grade prediction to score against.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">AI predicted</p>
              <p className="text-3xl font-display font-bold tabular-nums mt-1">
                {predictedGrade ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Pre-grade estimate</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-[10px] uppercase tracking-wider text-emerald-500">Actual slab</p>
              <p className="text-3xl font-display font-bold tabular-nums mt-1">
                {actualGrade ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{actualCompany || "Confirmed"}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                {accuracyScore != null && accuracyScore >= 70 ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {verdict}
                {typeof deltaGrades === "number" && deltaGrades !== 0 && (
                  <span className="text-muted-foreground/70">
                    ({deltaGrades > 0 ? "+" : ""}{deltaGrades} grade{Math.abs(deltaGrades) === 1 ? "" : "s"})
                  </span>
                )}
              </span>
              <span className="text-xs font-semibold tabular-nums">{accuracyScore ?? 0}/100</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${tone.bar}`}
                style={{ width: `${Math.max(0, Math.min(100, accuracyScore ?? 0))}%` }}
              />
            </div>
          </div>

          {predictedValueMid != null && actualValueMid != null && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">AI value estimate</p>
                <p className="text-lg font-display font-bold tabular-nums">
                  ${Math.round(predictedValueMid).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Graded market</p>
                <p className="text-lg font-display font-bold tabular-nums">
                  ${Math.round(actualValueMid).toLocaleString()}
                </p>
                {valueDeltaPct != null && (
                  <p className={`text-xs mt-0.5 ${valueDeltaPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {valueDeltaPct >= 0 ? "+" : ""}{valueDeltaPct.toFixed(0)}% vs AI
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
