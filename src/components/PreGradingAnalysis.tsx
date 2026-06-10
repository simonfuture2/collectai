import { CheckCircle, XCircle, AlertCircle, Target, Square, Layers, Sparkles } from "lucide-react";

interface CenteringData {
  score?: number;
  frontLeftRight?: string;
  frontTopBottom?: string;
  backLeftRight?: string;
  backTopBottom?: string;
  notes?: string;
  psa10Eligible?: boolean;
}

interface CornerData {
  score?: number;
  topLeft?: string;
  topRight?: string;
  bottomLeft?: string;
  bottomRight?: string;
  notes?: string;
}

interface EdgeData {
  score?: number;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  notes?: string;
}

interface SurfaceData {
  score?: number;
  front?: string;
  back?: string;
  holoCondition?: string;
  notes?: string;
}

interface PreGradingData {
  centering?: CenteringData;
  corners?: CornerData;
  edges?: EdgeData;
  surface?: SurfaceData;
  overallScore?: number;
  predictedGrades?: {
    psa?: number;
    bgs?: number;
    cgc?: number;
    sgc?: number;
  };
  bgsSubgrades?: {
    centering?: number;
    corners?: number;
    edges?: number;
    surface?: number;
  };
  gradingRecommendation?: string;
}

interface PreGradingAnalysisProps {
  data: PreGradingData;
}

function ScoreIndicator({ score, label }: { score?: number; label: string }) {
  if (!score) return null;
  
  const getColor = (s: number) => {
    if (s >= 9) return "text-green-500 bg-green-500/10 border-green-500/30";
    if (s >= 7) return "text-yellow-500 bg-yellow-500/10 border-yellow-500/30";
    if (s >= 5) return "text-orange-500 bg-orange-500/10 border-orange-500/30";
    return "text-red-500 bg-red-500/10 border-red-500/30";
  };

  const getIcon = (s: number) => {
    if (s >= 9) return <CheckCircle className="w-4 h-4" />;
    if (s >= 7) return <AlertCircle className="w-4 h-4" />;
    return <XCircle className="w-4 h-4" />;
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getColor(score)}`}>
      {getIcon(score)}
      <span className="font-medium">{score}/10</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function ScoreBar({ score, label }: { score?: number; label: string }) {
  if (!score) return null;
  
  const getGradient = (s: number) => {
    if (s >= 9) return "from-green-500 to-emerald-400";
    if (s >= 7) return "from-yellow-500 to-amber-400";
    if (s >= 5) return "from-orange-500 to-orange-400";
    return "from-red-500 to-rose-400";
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold">{score}/10</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r ${getGradient(score)} rounded-full transition-all duration-500`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
    </div>
  );
}

const GRADE_DIMENSIONS = ["centering", "corners", "edges", "surface"] as const;
type GradeDimension = (typeof GRADE_DIMENSIONS)[number];

function gradeBandLabel(score: number): string {
  if (score >= 10) return "Gem Mint";
  if (score >= 9) return "Mint";
  if (score >= 7) return "Near Mint";
  if (score >= 5) return "Excellent";
  if (score >= 3) return "Very Good";
  return "Poor";
}

// Mirror of the server-side grading rubric (supabase/functions/collectai-grade):
// the overall pre-grade band is the LOWEST of the four dimensions — graders
// punish the worst flaw, not the average — shown as a two-grade range with the
// limiting dimension named, never a single certain grade.
function computePreGrade(data: PreGradingData) {
  const scores: Array<[GradeDimension, number]> = [];
  for (const d of GRADE_DIMENSIONS) {
    const s = data[d]?.score;
    if (typeof s === "number" && Number.isFinite(s)) scores.push([d, s]);
  }
  if (scores.length === 0) return null;
  const min = Math.min(...scores.map(([, v]) => v));
  const limiting = scores.filter(([, v]) => v === min).map(([d]) => d);
  const low = min >= 10 ? 9 : min;
  const high = Math.min(10, min + 1);
  return { low, high, band: gradeBandLabel(min), limiting, allTied: limiting.length === scores.length };
}

export default function PreGradingAnalysis({ data }: PreGradingAnalysisProps) {
  if (!data || (!data.centering && !data.corners && !data.edges && !data.surface)) {
    return null;
  }

  const preGrade = computePreGrade(data);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg">Pre-Grading Analysis</h2>
        <span className="ml-auto px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
          Pro Grade Report
        </span>
      </div>

      {/* Overall Score */}
      {data.overallScore && (
        <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-xl border border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">Overall Condition Score</p>
          <p className="text-5xl font-display font-bold text-gradient-primary">{data.overallScore.toFixed(1)}</p>
          <p className="text-sm text-muted-foreground mt-1">out of 10</p>
        </div>
      )}

      {/* Grounded pre-grade: lowest dimension caps the band */}
      {preGrade && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated pre-grade</p>
            <p className="font-display font-bold text-lg leading-tight">
              {preGrade.band} {preGrade.low}–{preGrade.high}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {preGrade.allTied
                ? "Even across all four dimensions."
                : `Limited by ${preGrade.limiting.join(" & ")} — the grade is capped at the worst flaw.`}
            </p>
            <p className="text-[11px] text-muted-foreground italic mt-1">
              Pre-grade estimate from photos — a range, not a guaranteed grade.
            </p>
          </div>
        </div>
      )}

      {/* Score Bars Overview */}
      <div className="space-y-3">
        <ScoreBar score={data.centering?.score} label="Centering" />
        <ScoreBar score={data.corners?.score} label="Corners" />
        <ScoreBar score={data.edges?.score} label="Edges" />
        <ScoreBar score={data.surface?.score} label="Surface" />
      </div>

      {/* Centering Details */}
      {data.centering && (
        <div className="space-y-3 p-4 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Centering Analysis</h3>
            {data.centering.psa10Eligible !== undefined && (
              <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                data.centering.psa10Eligible 
                  ? "bg-green-500/20 text-green-500" 
                  : "bg-yellow-500/20 text-yellow-500"
              }`}>
                {data.centering.psa10Eligible ? "PSA 10 Eligible" : "May Limit Grade"}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Front L/R</p>
              <p className="font-mono font-bold">{data.centering.frontLeftRight || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Front T/B</p>
              <p className="font-mono font-bold">{data.centering.frontTopBottom || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Back L/R</p>
              <p className="font-mono font-bold">{data.centering.backLeftRight || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Back T/B</p>
              <p className="font-mono font-bold">{data.centering.backTopBottom || "—"}</p>
            </div>
          </div>
          
          {data.centering.notes && (
            <p className="text-sm text-muted-foreground">{data.centering.notes}</p>
          )}
        </div>
      )}

      {/* Corners Details */}
      {data.corners && (
        <div className="space-y-3 p-4 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-2">
            <Square className="w-4 h-4 text-secondary" />
            <h3 className="font-semibold">Corners Analysis</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Top Left</p>
              <p className="text-sm">{data.corners.topLeft || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Top Right</p>
              <p className="text-sm">{data.corners.topRight || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Bottom Left</p>
              <p className="text-sm">{data.corners.bottomLeft || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Bottom Right</p>
              <p className="text-sm">{data.corners.bottomRight || "—"}</p>
            </div>
          </div>
          
          {data.corners.notes && (
            <p className="text-sm text-muted-foreground">{data.corners.notes}</p>
          )}
        </div>
      )}

      {/* Edges Details */}
      {data.edges && (
        <div className="space-y-3 p-4 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" />
            <h3 className="font-semibold">Edges Analysis</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Top Edge</p>
              <p className="text-sm">{data.edges.top || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Bottom Edge</p>
              <p className="text-sm">{data.edges.bottom || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Left Edge</p>
              <p className="text-sm">{data.edges.left || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Right Edge</p>
              <p className="text-sm">{data.edges.right || "—"}</p>
            </div>
          </div>
          
          {data.edges.notes && (
            <p className="text-sm text-muted-foreground">{data.edges.notes}</p>
          )}
        </div>
      )}

      {/* Surface Details */}
      {data.surface && (
        <div className="space-y-3 p-4 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-500" />
            <h3 className="font-semibold">Surface Analysis</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Front Surface</p>
              <p className="text-sm">{data.surface.front || "—"}</p>
            </div>
            <div className="p-3 bg-background rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Back Surface</p>
              <p className="text-sm">{data.surface.back || "—"}</p>
            </div>
          </div>
          
          {data.surface.holoCondition && (
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-xs text-primary mb-1">Holographic Condition</p>
              <p className="text-sm text-foreground">{data.surface.holoCondition}</p>
            </div>
          )}
          
          {data.surface.notes && (
            <p className="text-sm text-muted-foreground">{data.surface.notes}</p>
          )}
        </div>
      )}

      {/* Predicted Grades */}
      {data.predictedGrades && (
        <div className="space-y-3">
          <h3 className="font-semibold">Predicted Grades by Company</h3>
          <div className="grid grid-cols-4 gap-2">
            {data.predictedGrades.psa && (
              <div className="text-center p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-xs text-muted-foreground">PSA</p>
                <p className="text-2xl font-bold text-red-500">{data.predictedGrades.psa}</p>
              </div>
            )}
            {data.predictedGrades.bgs && (
              <div className="text-center p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-xs text-muted-foreground">BGS</p>
                <p className="text-2xl font-bold text-blue-500">{data.predictedGrades.bgs}</p>
              </div>
            )}
            {data.predictedGrades.cgc && (
              <div className="text-center p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <p className="text-xs text-muted-foreground">CGC</p>
                <p className="text-2xl font-bold text-yellow-500">{data.predictedGrades.cgc}</p>
              </div>
            )}
            {data.predictedGrades.sgc && (
              <div className="text-center p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-xs text-muted-foreground">SGC</p>
                <p className="text-2xl font-bold text-green-500">{data.predictedGrades.sgc}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BGS Subgrades */}
      {data.bgsSubgrades && (
        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
          <p className="text-sm font-medium text-blue-500 mb-3">BGS-Style Subgrades</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Centering</p>
              <p className="font-bold">{data.bgsSubgrades.centering || "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Corners</p>
              <p className="font-bold">{data.bgsSubgrades.corners || "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Edges</p>
              <p className="font-bold">{data.bgsSubgrades.edges || "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Surface</p>
              <p className="font-bold">{data.bgsSubgrades.surface || "—"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Grading Recommendation */}
      {data.gradingRecommendation && (
        <div className="p-4 bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-xl">
          <p className="text-sm font-medium text-primary mb-2">Expert Recommendation</p>
          <p className="text-sm text-foreground">{data.gradingRecommendation}</p>
        </div>
      )}
    </div>
  );
}