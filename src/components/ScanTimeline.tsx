import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload, Save, ArrowRight, type LucideIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ScanTimelineProps {
  /** True while the scan is in flight. */
  running: boolean;
  /** Flip to true once the analyze response arrives — fast-completes any remaining steps. */
  done: boolean;
}

interface StepDef {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** Expected duration in ms — drives auto-advance while waiting on the single edge call. */
  expectedMs: number;
}

const STEPS: StepDef[] = [
  { id: "upload", label: "Uploading", desc: "Sending your card image", icon: Upload, expectedMs: 2500 },
  { id: "save", label: "Saving", desc: "Adding to your collection", icon: Save, expectedMs: 1500 },
  { id: "open", label: "Opening", desc: "AI analysis continues in background", icon: ArrowRight, expectedMs: 1000 },
];

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const ScanTimeline = ({ running, done }: ScanTimelineProps) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [startedAt, setStartedAt] = useState<number[]>([]);
  const [endedAt, setEndedAt] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  // Reset on a new run
  useEffect(() => {
    if (running && startedAt.length === 0) {
      const t = Date.now();
      setActiveIdx(0);
      setStartedAt([t]);
      setEndedAt([]);
      setNow(t);
    }
    if (!running && !done) {
      // Hard reset between runs
      setActiveIdx(0);
      setStartedAt([]);
      setEndedAt([]);
    }
  }, [running, done, startedAt.length]);

  // Ticker
  useEffect(() => {
    if (!running) {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = window.setInterval(() => setNow(Date.now()), 150);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [running]);

  // Auto-advance based on expected durations
  useEffect(() => {
    if (!running || done) return;
    if (activeIdx >= STEPS.length - 1) return;
    const startedThis = startedAt[activeIdx];
    if (!startedThis) return;
    const elapsed = now - startedThis;
    if (elapsed >= STEPS[activeIdx].expectedMs) {
      const t = Date.now();
      setEndedAt((prev) => {
        const next = [...prev];
        next[activeIdx] = t;
        return next;
      });
      setStartedAt((prev) => {
        const next = [...prev];
        next[activeIdx + 1] = t;
        return next;
      });
      setActiveIdx((i) => i + 1);
    }
  }, [now, running, done, activeIdx, startedAt]);

  // Fast-complete on done
  useEffect(() => {
    if (!done) return;
    const t = Date.now();
    setEndedAt((prev) => {
      const next = [...prev];
      for (let i = 0; i < STEPS.length; i++) {
        if (next[i] === undefined) next[i] = t;
      }
      return next;
    });
    setStartedAt((prev) => {
      const next = [...prev];
      for (let i = 0; i < STEPS.length; i++) {
        if (next[i] === undefined) next[i] = t;
      }
      return next;
    });
    setActiveIdx(STEPS.length);
  }, [done]);

  const stepStatus = (i: number): "pending" | "active" | "done" => {
    if (endedAt[i]) return "done";
    if (i === activeIdx && running) return "active";
    return "pending";
  };

  const stepDuration = (i: number) => {
    const s = startedAt[i];
    const e = endedAt[i];
    if (s && e) return e - s;
    if (s && stepStatus(i) === "active") return Math.max(0, now - s);
    return null;
  };

  // Overall progress: completed steps + fraction of active step
  const completedCount = endedAt.filter(Boolean).length;
  let frac = 0;
  if (running && activeIdx < STEPS.length) {
    const s = startedAt[activeIdx];
    if (s) frac = Math.min(0.98, (now - s) / STEPS[activeIdx].expectedMs);
  }
  const progress = done ? 100 : Math.round(((completedCount + frac) / STEPS.length) * 100);

  const totalElapsed = startedAt[0]
    ? (done && endedAt[STEPS.length - 1] ? endedAt[STEPS.length - 1] : now) - startedAt[0]
    : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Analyzing your card</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {done ? "Complete" : "This usually takes 25–40 seconds"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Elapsed</div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            {formatDuration(totalElapsed)}
          </div>
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      <ol className="relative space-y-4 pl-1">
        {STEPS.map((step, i) => {
          const status = stepStatus(i);
          const Icon = step.icon;
          const duration = stepDuration(i);
          const isLast = i === STEPS.length - 1;

          return (
            <li key={step.id} className="relative flex items-start gap-4">
              {/* Vertical connector */}
              {!isLast && (
                <span
                  className={`absolute left-[15px] top-9 bottom-[-1rem] w-px transition-colors duration-500 ${
                    status === "done" ? "bg-primary" : "bg-border"
                  }`}
                  aria-hidden
                />
              )}

              {/* Status node */}
              <div
                className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  status === "done"
                    ? "bg-primary text-primary-foreground"
                    : status === "active"
                      ? "bg-primary/15 text-primary border-2 border-primary"
                      : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {status === "done" ? (
                  <Check className="w-4 h-4" />
                ) : status === "active" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                {status === "active" && (
                  <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" aria-hidden />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={`text-sm font-semibold ${
                      status === "pending" ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                  {duration !== null && (
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        status === "active" ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {status === "active" && duration !== null && duration > step.expectedMs
                    ? "Taking a little longer than usual — hang tight…"
                    : step.desc}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default ScanTimeline;
