import { useEffect, useState } from "react";

const stages = ["idle", "scanning", "graded"] as const;
type Stage = typeof stages[number];

const ScanDemo = () => {
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    const cycle = () => {
      setStage("idle");
      const t1 = setTimeout(() => setStage("scanning"), 800);
      const t2 = setTimeout(() => setStage("graded"), 2400);
      const t3 = setTimeout(cycle, 5500);
      return [t1, t2, t3];
    };
    const timers = cycle();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-[3/4]">
      {/* Card silhouette */}
      <div className="absolute inset-0 rounded-2xl border-2 border-border bg-card overflow-hidden shadow-xl">
        {/* Card inner content mockup */}
        <div className="absolute inset-3 rounded-xl border border-border/50 bg-muted/30 flex flex-col items-center justify-center gap-3">
          {/* Card image placeholder */}
          <div className="w-3/4 aspect-square rounded-lg bg-muted/60 flex items-center justify-center">
            <svg viewBox="0 0 80 80" className="w-16 h-16 text-muted-foreground/30">
              <rect x="10" y="15" width="60" height="50" rx="4" fill="currentColor" />
              <circle cx="30" cy="35" r="8" fill="hsl(var(--background))" opacity="0.5" />
              <path d="M10 55 L30 40 L50 50 L70 35 L70 65 L10 65Z" fill="hsl(var(--background))" opacity="0.3" />
            </svg>
          </div>
          {/* Card text lines */}
          <div className="w-3/4 space-y-2">
            <div className="h-3 rounded-full bg-muted/60 w-full" />
            <div className="h-2.5 rounded-full bg-muted/40 w-2/3" />
          </div>
        </div>

        {/* Scanning sweep overlay */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            stage === "scanning" ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-primary/0 via-primary/20 to-primary/0 animate-scan-sweep" />
          {/* Scan line */}
          <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_12px_hsl(var(--primary))] animate-scan-line" />
        </div>

        {/* Grade badge */}
        <div
          className={`absolute top-4 right-4 transition-all duration-500 ${
            stage === "graded"
              ? "opacity-100 scale-100"
              : "opacity-0 scale-50"
          }`}
        >
          <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-lg glow-purple">
            <div className="text-center">
              <p className="text-xs font-bold text-primary-foreground leading-none">PSA</p>
              <p className="text-lg font-display font-bold text-primary-foreground leading-none">9</p>
            </div>
          </div>
        </div>

        {/* Value badge */}
        <div
          className={`absolute bottom-4 left-4 right-4 transition-all duration-500 delay-200 ${
            stage === "graded"
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
        >
          <div className="rounded-xl bg-card/90 backdrop-blur border border-border p-3 shadow-lg">
            <p className="text-xs text-muted-foreground">Estimated Value</p>
            <p className="text-xl font-display font-bold text-gradient-primary">$245 – $320</p>
            <p className="text-xs text-muted-foreground mt-0.5">Charizard Holo · Base Set · 1999</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScanDemo;
