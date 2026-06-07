import { useEffect, useState } from "react";
import { Check, Loader2, Circle, XCircle, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export type AnalysisStatus =
  | "pending"
  | "identifying"
  | "pricing"
  | "analyzing"
  | "verifying"
  | "complete"
  | "failed"
  | string
  | null
  | undefined;

interface AnalysisProgressProps {
  status: AnalysisStatus;
  startedAt?: string | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}

const STEPS = [
  {
    key: "identifying",
    label: "Identifying",
    desc: "AI is reading the card — name, set, year, number…",
  },
  {
    key: "pricing",
    label: "Market search",
    desc: "Pulling recent eBay & marketplace sales…",
  },
  {
    key: "analyzing",
    label: "Pricing",
    desc: "Blending comps into low/high estimate…",
  },
  {
    key: "verifying",
    label: "Verifying",
    desc: "Sanity-checking the result and saving…",
  },
] as const;

const STATUS_TO_IDX: Record<string, number> = {
  pending: 0,
  identifying: 0,
  pricing: 1,
  analyzing: 2,
  verifying: 3,
};

const formatElapsed = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const AnalysisProgress = ({
  status,
  startedAt,
  errorMessage,
  onRetry,
  retrying,
}: AnalysisProgressProps) => {
  const isRunning =
    !!status && ["pending", "identifying", "pricing", "analyzing", "verifying"].includes(status);
  const isFailed = status === "failed";

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isRunning]);

  if (!isRunning && !isFailed) return null;

  if (isFailed) {
    return (
      <div
        role="alert"
        className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3"
      >
        <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-sm">AI analysis failed</p>
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {errorMessage ||
              "Something went wrong while analyzing this card. This is usually temporary — please try again."}
          </p>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            <RefreshCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        )}
      </div>
    );
  }

  const activeIdx = STATUS_TO_IDX[status as string] ?? 0;
  const progress = Math.round(((activeIdx + 0.5) / STEPS.length) * 100);
  const startedMs = startedAt ? new Date(startedAt).getTime() : null;
  const elapsed = startedMs ? Math.max(0, now - startedMs) : null;
  const slow = elapsed !== null && elapsed > 60_000;

  return (
    <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <p className="font-display font-semibold text-sm">
            {STEPS[activeIdx]?.label || "Analyzing"}
          </p>
        </div>
        {elapsed !== null && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      <Progress value={progress} className="h-1.5" />

      <ol className="flex items-start justify-between gap-2">
        {STEPS.map((step, i) => {
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <li key={step.key} className="flex-1 flex flex-col items-center text-center">
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                      ? "border-2 border-primary text-primary bg-background"
                      : "border border-border text-muted-foreground bg-background"
                }`}
              >
                {isDone ? (
                  <Check className="w-4 h-4" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </span>
              <p
                className={`mt-2 text-xs font-medium ${
                  isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-muted-foreground text-center">
        {STEPS[activeIdx]?.desc}
      </p>

      {slow ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
          Taking a little longer than usual — market searches can sometimes take up to 90 seconds.
          Feel free to navigate away; we'll keep working in the background.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground text-center">
          This usually takes 30–45 seconds. You can leave this page — it'll be ready when you come back.
        </p>
      )}
    </div>
  );
};

export default AnalysisProgress;
