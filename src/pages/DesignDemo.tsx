import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Value } from "@/components/ui/value";
import { FadeUp, PressScale } from "@/components/ui/motion";

export default function DesignDemo() {
  const [seed, setSeed] = useState(0);

  return (
    <div className="min-h-screen bg-base text-text-primary">
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,175,55,0.08), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-5xl px-6 py-20">
        <FadeUp>
          <p className="font-numeric text-xs uppercase tracking-[0.3em] text-text-muted">
            Design system / v1
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Premium foundation preview
          </h1>
          <p className="mt-3 max-w-xl text-text-muted">
            Tokens, glass surfaces, and value typography. Building blocks only — no screens
            redesigned yet.
          </p>
        </FadeUp>

        <div key={seed} className="mt-12 grid gap-5 md:grid-cols-3">
          <FadeUp delay={0.05}>
            <GlassCard hover="lift" padding="lg" className="h-full">
              <p className="text-xs uppercase tracking-widest text-text-muted">
                Portfolio value
              </p>
              <div className="mt-6">
                <Value amount={12480.55} size="xl" tone="gold" animate />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <Value amount={214.3} size="sm" tone="gain" showSign animate />
                <span className="text-xs text-text-muted">today</span>
              </div>
            </GlassCard>
          </FadeUp>

          <FadeUp delay={0.15}>
            <GlassCard hover="lift" padding="lg" className="h-full">
              <p className="text-xs uppercase tracking-widest text-text-muted">Best card</p>
              <div className="mt-6">
                <Value amount={1842} size="lg" tone="default" decimals={0} animate />
              </div>
              <p className="mt-4 text-sm text-text-muted">Charizard · PSA 9</p>
            </GlassCard>
          </FadeUp>

          <FadeUp delay={0.25}>
            <GlassCard hover="lift" padding="lg" className="h-full">
              <p className="text-xs uppercase tracking-widest text-text-muted">7-day change</p>
              <div className="mt-6">
                <Value amount={-58.2} size="lg" tone="loss" showSign animate />
              </div>
              <p className="mt-4 text-sm text-text-muted">Across 24 cards</p>
            </GlassCard>
          </FadeUp>
        </div>

        <FadeUp delay={0.4}>
          <div className="mt-12 flex items-center gap-4">
            <PressScale
              as="button"
              onClick={() => setSeed((s) => s + 1)}
              className="rounded-full border border-border-subtle bg-surface px-6 py-3 text-sm font-medium text-text-primary"
            >
              Replay animation
            </PressScale>
            <span className="text-xs text-text-muted">PressScale + CountUp demo</span>
          </div>
        </FadeUp>
      </div>
    </div>
  );
}
