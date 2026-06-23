import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Value } from "@/components/ui/value";
import { Input } from "@/components/ui/input";
import { Award, Check, Minus, TrendingDown, TrendingUp } from "lucide-react";

type GraderKey = "psa" | "bgs" | "cgc" | "sgc" | "tag";

interface GraderValues {
  estimatedGrade?: number;
  valueAtGrade?: number;
  valueAtPSA10?: number; valueAtPSA9?: number; valueAtPSA8?: number;
  valueAtBGS10?: number; valueAtBGS9_5?: number; valueAtBGS9?: number;
  valueAtCGC10?: number; valueAtCGC9_5?: number; valueAtCGC9?: number;
  valueAtSGC10?: number; valueAtSGC9_5?: number; valueAtSGC9?: number;
  valueAtTAG10?: number; valueAtTAG9_5?: number; valueAtTAG9?: number;
  gradingCost?: number;
}

interface GradedValueEstimates {
  recommendedGrader?: string;
  psa?: GraderValues; bgs?: GraderValues; cgc?: GraderValues;
  sgc?: GraderValues; tag?: GraderValues;
}

const GRADE_DEFS: Record<GraderKey, { label: string; grade: string; field: keyof GraderValues }[]> = {
  psa: [
    { label: "PSA 10", grade: "10", field: "valueAtPSA10" },
    { label: "PSA 9",  grade: "9",  field: "valueAtPSA9" },
    { label: "PSA 8",  grade: "8",  field: "valueAtPSA8" },
  ],
  bgs: [
    { label: "BGS 10",  grade: "10",  field: "valueAtBGS10" },
    { label: "BGS 9.5", grade: "9.5", field: "valueAtBGS9_5" },
    { label: "BGS 9",   grade: "9",   field: "valueAtBGS9" },
  ],
  cgc: [
    { label: "CGC 10",  grade: "10",  field: "valueAtCGC10" },
    { label: "CGC 9.5", grade: "9.5", field: "valueAtCGC9_5" },
    { label: "CGC 9",   grade: "9",   field: "valueAtCGC9" },
  ],
  sgc: [
    { label: "SGC 10",  grade: "10",  field: "valueAtSGC10" },
    { label: "SGC 9.5", grade: "9.5", field: "valueAtSGC9_5" },
    { label: "SGC 9",   grade: "9",   field: "valueAtSGC9" },
  ],
  tag: [
    { label: "TAG 10",  grade: "10",  field: "valueAtTAG10" },
    { label: "TAG 9.5", grade: "9.5", field: "valueAtTAG9_5" },
    { label: "TAG 9",   grade: "9",   field: "valueAtTAG9" },
  ],
};

const DEFAULT_COSTS: Record<GraderKey, number> = {
  psa: 25, bgs: 30, cgc: 25, sgc: 25, tag: 20,
};

export interface GradeLadderProps {
  estimates?: GradedValueEstimates | null;
  rawValue: number;
  className?: string;
}

export default function GradeLadder({ estimates, rawValue, className }: GradeLadderProps) {
  const grader: GraderKey = useMemo(() => {
    const rec = (estimates?.recommendedGrader || "").toLowerCase() as GraderKey;
    if (rec && estimates?.[rec]) return rec;
    const order: GraderKey[] = ["psa", "bgs", "cgc", "sgc", "tag"];
    return order.find((k) => estimates?.[k]) || "psa";
  }, [estimates]);

  const graderVals = estimates?.[grader];
  const initialCost = graderVals?.gradingCost ?? DEFAULT_COSTS[grader];
  const [cost, setCost] = useState<number>(initialCost);

  const rows = useMemo(() => {
    if (!graderVals) return [];
    return GRADE_DEFS[grader]
      .map((d) => ({
        label: d.label,
        grade: d.grade,
        value: Number(graderVals[d.field] ?? 0),
      }))
      .filter((r) => r.value > 0)
      .map((r) => ({ ...r, net: r.value - cost }));
  }, [graderVals, grader, cost]);

  const hasData = rows.length > 0;
  const bestNet = hasData ? Math.max(...rows.map((r) => r.net)) : 0;
  const bestUpside = hasData ? bestNet - rawValue : 0;
  const upliftPct = rawValue > 0 ? (bestUpside / rawValue) * 100 : 0;
  const worthGrading = hasData && rawValue > 0 && bestUpside > rawValue * 0.25 && bestUpside > 15;

  return (
    <GlassCard padding="lg" className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Should I Grade This?
          </h3>
        </div>
        {hasData && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            via {grader.toUpperCase()}
          </span>
        )}
      </div>

      {!hasData ? (
        <EmptyState
          icon={Minus}
          size="sm"
          bare
          title="Not enough graded comps yet"
          description="Once recent graded sales are found, we'll show a full grade-by-grade breakdown."
        />
      ) : (
        <>
          {/* Verdict banner */}
          <div
            className={[
              "rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3 border",
              worthGrading
                ? "border-gain/40 bg-gain/10"
                : "border-border-subtle bg-surface/60",
            ].join(" ")}
          >
            <div className="flex items-center gap-3">
              {worthGrading ? (
                <TrendingUp className="w-5 h-5 text-gain shrink-0" />
              ) : (
                <TrendingDown className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
              <div>
                <div className={[
                  "text-sm font-bold uppercase tracking-[0.16em]",
                  worthGrading ? "text-gain" : "text-muted-foreground",
                ].join(" ")}>
                  {worthGrading ? "Worth Grading" : "Not Worth It"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Best net{" "}
                  <span className="font-numeric text-foreground">
                    ${bestNet.toFixed(2)}
                  </span>{" "}
                  vs raw{" "}
                  <span className="font-numeric text-foreground">
                    ${rawValue.toFixed(2)}
                  </span>
                  {rawValue > 0 && (
                    <>
                      {" "}·{" "}
                      <span className={worthGrading ? "text-gain" : "text-loss"}>
                        {bestUpside >= 0 ? "+" : "−"}${Math.abs(bestUpside).toFixed(2)}
                        {" "}({upliftPct >= 0 ? "+" : ""}{upliftPct.toFixed(0)}%)
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cost input */}
          <div className="flex items-center justify-between gap-3 mb-3 px-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Grading cost
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground font-numeric">$</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={Number.isFinite(cost) ? cost : 0}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  setCost(Number.isFinite(n) ? n : 0);
                }}
                className="w-20 h-8 text-right font-numeric text-sm"
              />
            </div>
          </div>

          {/* Ladder header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground border-b border-border-subtle/60">
            <div>Grade</div>
            <div className="text-right">Value</div>
            <div className="text-right">− Cost</div>
            <div className="text-right">Net</div>
          </div>

          {/* Ladder rows */}
          <div className="divide-y divide-border-subtle/40">
            {rows.map((r) => {
              const isBest = r.net === bestNet;
              return (
                <div
                  key={r.label}
                  className={[
                    "grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-3 items-center transition-colors",
                    isBest
                      ? "bg-gradient-to-r from-primary/15 to-transparent rounded-lg"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    {isBest && <Check className="w-3.5 h-3.5 text-primary" />}
                    <span className={isBest ? "font-bold text-foreground" : "font-medium text-foreground"}>
                      {r.label}
                    </span>
                    {isBest && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.16em] bg-gradient-gold bg-clip-text text-transparent">
                        Best
                      </span>
                    )}
                  </div>
                  <div className="text-right font-numeric text-sm text-foreground">
                    ${r.value.toFixed(2)}
                  </div>
                  <div className="text-right font-numeric text-sm text-muted-foreground">
                    −${cost.toFixed(2)}
                  </div>
                  <div className="text-right">
                    {isBest ? (
                      <Value amount={r.net} size="md" tone="gold" decimals={2} animate={false} />
                    ) : (
                      <span className={[
                        "font-numeric text-sm font-semibold",
                        r.net >= rawValue ? "text-foreground" : "text-muted-foreground",
                      ].join(" ")}>
                        ${r.net.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Raw baseline footer */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-3 mt-1 items-center border-t border-border-subtle/60 text-muted-foreground">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">Raw baseline</div>
            <div></div>
            <div></div>
            <div className="text-right font-numeric text-sm">${rawValue.toFixed(2)}</div>
          </div>
        </>
      )}
    </GlassCard>
  );
}
