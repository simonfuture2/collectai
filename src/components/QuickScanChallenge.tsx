import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Lock, Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScanResult {
  card_name: string;
  card_set: string;
  card_year: string;
  condition_grade: string;
  estimated_value_low: number;
  estimated_value_high: number;
  confidence: number;
  category: string;
}

type Phase = "upload" | "scanning" | "result";

const QuickScanChallenge = () => {
  const [phase, setPhase] = useState<Phase>("upload");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      setPhase("scanning");

      try {
        const { data, error } = await supabase.functions.invoke("quick-scan", {
          body: { imageBase64: base64 },
        });

        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        setResult(data as ScanResult);
        setPhase("result");
      } catch (err: any) {
        console.error("Quick scan error:", err);
        toast.error(err.message || "Failed to scan card. Try again.");
        setPhase("upload");
        setPreview("");
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const reset = () => {
    setPhase("upload");
    setResult(null);
    setPreview("");
  };

  return (
    <div className="mt-24 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-5xl font-display font-bold mb-3">
          Think Your Card Is <span className="text-gradient-primary">Worth Something?</span>
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Upload a photo and find out in seconds — no account needed
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Left: Upload / Preview */}
        <div className="relative">
          {phase === "upload" && (
            <div
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
                dragOver
                  ? "border-primary bg-primary/5 scale-[1.02]"
                  : "border-border hover:border-primary/50 hover:bg-card"
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-display font-semibold mb-1">Drop your card here</p>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <Button variant="outline" size="sm" className="pointer-events-none">
                <Camera className="mr-2 w-4 h-4" /> Choose Photo
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processFile(file);
                }}
              />
            </div>
          )}

          {(phase === "scanning" || phase === "result") && preview && (
            <div className="relative rounded-2xl overflow-hidden border-2 border-border shadow-xl aspect-[3/4]">
              <img src={preview} alt="Your card" className="w-full h-full object-cover" />
              {phase === "scanning" && (
                <>
                  <div className="absolute inset-0 bg-primary/10 animate-scan-sweep" />
                  <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_hsl(var(--primary))] animate-scan-line" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="glass px-6 py-3 rounded-xl flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      <span className="font-display font-semibold text-sm">Analyzing card…</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div>
          {phase === "upload" && (
            <div className="p-8 rounded-2xl bg-card border border-border text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-display font-semibold mb-1">AI Results Appear Here</p>
              <p className="text-sm text-muted-foreground">Upload a card photo to get your free Quick Scan</p>
            </div>
          )}

          {phase === "scanning" && (
            <div className="p-8 rounded-2xl bg-card border border-border space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 rounded bg-muted animate-pulse" style={{ width: `${90 - i * 15}%` }} />
              ))}
              <div className="h-16 rounded bg-muted animate-pulse" />
              <div className="h-6 rounded bg-muted animate-pulse w-1/2" />
            </div>
          )}

          {phase === "result" && result && (
            <div className="space-y-4 animate-celebrate">
              {/* Teaser — visible */}
              <div className="p-6 rounded-2xl bg-card border-2 border-primary shadow-lg">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">{result.category}</span>
                <h3 className="text-xl font-display font-bold mt-1">{result.card_name}</h3>
                <p className="text-sm text-muted-foreground">{result.card_set} · {result.card_year}</p>

                <div className="flex gap-4 mt-4">
                  <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-center flex-1">
                    <p className="text-xs text-muted-foreground">Grade</p>
                    <p className="text-lg font-display font-bold text-primary">{result.condition_grade}</p>
                  </div>
                  <div className="px-4 py-2 rounded-xl bg-collectai-green/10 border border-collectai-green/30 text-center flex-1">
                    <p className="text-xs text-muted-foreground">Est. Value</p>
                    <p className="text-lg font-display font-bold text-collectai-green">
                      ${result.estimated_value_low} – ${result.estimated_value_high}
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground text-right">
                  {result.confidence}% confidence
                </div>
              </div>

              {/* Locked sections */}
              {["Pre-Grading Analysis", "Market Comparisons", "Graded Value Estimates"].map((label) => (
                <div key={label} className="relative p-4 rounded-xl bg-card border border-border overflow-hidden">
                  <div className="blur-sm select-none pointer-events-none">
                    <div className="h-3 rounded bg-muted w-3/4 mb-2" />
                    <div className="h-3 rounded bg-muted w-1/2 mb-2" />
                    <div className="h-3 rounded bg-muted w-2/3" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-card/60 backdrop-blur-[2px]">
                    <div className="flex items-center gap-2 text-sm font-display font-semibold text-muted-foreground">
                      <Lock className="w-4 h-4" /> {label}
                    </div>
                  </div>
                </div>
              ))}

              {/* CTA */}
              <Link to="/auth">
                <Button size="lg" className="w-full gradient-primary text-lg py-6 rounded-xl glow-purple hover-lift mt-2">
                  <Sparkles className="mr-2 w-5 h-5" /> Sign Up Free to Unlock Full Report
                </Button>
              </Link>

              <button onClick={reset} className="flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw className="w-4 h-4" /> Scan another card
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickScanChallenge;
