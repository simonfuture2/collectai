import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Camera, Sparkles, ShieldCheck, ScanLine, X } from "lucide-react";

interface CameraWarmupProps {
  onContinue: () => void;
  onSkip?: () => void;
}

/**
 * One-screen explainer shown before the OS camera/file-picker prompt fires.
 * Purely presentational — the actual permission request still happens when
 * the user taps an upload slot afterwards.
 */
export default function CameraWarmup({ onContinue, onSkip }: CameraWarmupProps) {
  return (
    <div className="relative max-w-md mx-auto animate-fade-in">
      {onSkip && (
        <button
          onClick={onSkip}
          aria-label="Skip explainer"
          className="absolute -top-2 -right-2 p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <GlassCard padding="lg" className="overflow-hidden">
        <div className="flex flex-col items-center text-center gap-5">
          {/* Camera medallion */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 blur-xl" />
            <div className="relative w-20 h-20 rounded-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
              <Camera className="w-9 h-9 text-primary" strokeWidth={1.6} />
              <ScanLine className="absolute w-20 h-20 text-primary/40 animate-pulse" strokeWidth={0.8} />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-semibold">
              Before we start
            </p>
            <h2 className="text-2xl font-display font-bold tracking-tight">
              Scan a card to instantly identify and value it
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We'll use your camera (or a photo from your library) to read the card,
              grade its condition, and pull live market prices.
            </p>
          </div>

          {/* Trust row */}
          <div className="w-full grid grid-cols-2 gap-2 mt-1">
            <div className="flex items-start gap-2 rounded-xl border border-border-subtle/60 bg-surface/40 px-3 py-2.5 text-left">
              <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold leading-tight">Private by default</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  Photos stay in your account.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border-subtle/60 bg-surface/40 px-3 py-2.5 text-left">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold leading-tight">Instant results</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  Identified in seconds.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={onContinue}
            className="w-full gradient-primary text-white font-semibold py-6 text-base rounded-xl mt-2"
          >
            <Camera className="w-5 h-5 mr-2" />
            Continue
          </Button>

          <p className="text-[10px] text-muted-foreground -mt-1">
            You'll be asked for camera access on the next step.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
