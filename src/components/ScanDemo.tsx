import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, RotateCcw } from "lucide-react";
import charizardCard from "@/assets/scan-demo-charizard.jpeg";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Stage = "idle" | "scanning" | "graded" | "error";

interface DemoResult {
  cardName?: string;
  cardSet?: string;
  cardNumber?: string | null;
  category?: string;
  conditionGrade?: string;
  gradeNumber?: number;
  estimatedValueLow?: number;
  estimatedValueHigh?: number;
  currency?: string;
  confidence?: string;
}

const MAX_BYTES = 6 * 1024 * 1024;

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const ScanDemo = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string>(charizardCard);
  const [usingDefault, setUsingDefault] = useState(true);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (!usingDefault && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    if (!usingDefault && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(charizardCard);
    setUsingDefault(true);
    setResult(null);
    setErrorMsg("");
    setStage("idle");
  };

  const runScan = async (file: File) => {
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
      toast({ title: "Unsupported image", description: "Use JPG, PNG, or WebP.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Image too large", description: "Max 6 MB.", variant: "destructive" });
      return;
    }

    if (!usingDefault && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    const blobUrl = URL.createObjectURL(file);
    setPreviewUrl(blobUrl);
    setUsingDefault(false);
    setResult(null);
    setErrorMsg("");
    setStage("scanning");

    try {
      const imageBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("demo-scan", {
        body: { imageBase64, mimeType: file.type },
      });

      if (error) {
        // Try to surface server JSON error message
        const ctx = (error as any).context;
        let msg = error.message || "Scan failed";
        try {
          const parsed = ctx && (await ctx.json?.());
          if (parsed?.error) msg = parsed.error;
        } catch { /* ignore */ }
        setErrorMsg(msg);
        setStage("error");
        return;
      }

      if (!data?.success || !data?.data) {
        setErrorMsg(data?.error || "AI couldn't analyze that image.");
        setStage("error");
        return;
      }

      setResult(data.data as DemoResult);
      setStage("graded");
    } catch (e: any) {
      setErrorMsg(e?.message || "Something went wrong.");
      setStage("error");
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) runScan(f);
    e.target.value = "";
  };

  const subtitle =
    result && (result.cardName || result.cardSet)
      ? `${result.cardName ?? ""}${result.cardSet ? " · " + result.cardSet : ""}${
          result.cardNumber ? " · " + result.cardNumber : ""
        }`
      : "Charizard · Base Set Holo · 4/102";

  const valueLabel =
    result && typeof result.estimatedValueLow === "number" && typeof result.estimatedValueHigh === "number"
      ? `$${Math.round(result.estimatedValueLow)} – $${Math.round(result.estimatedValueHigh)}`
      : "$250 – $600";

  const gradeLetters = result?.conditionGrade?.split(/\s+/)[0]?.slice(0, 3).toUpperCase() || "NM";
  const gradeNum = result?.gradeNumber ?? 7;

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-[3/4]">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
      />

      <div className="absolute inset-0 rounded-2xl border-2 border-border bg-card overflow-hidden shadow-xl">
        <img
          src={previewUrl}
          alt={result?.cardName ? `${result.cardName} card` : "Trading card preview"}
          width={600}
          height={800}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Scanning overlay */}
        {stage === "scanning" && (
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/0 via-primary/20 to-primary/0 animate-scan-sweep" />
            <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_12px_hsl(var(--primary))] animate-scan-line" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 rounded-xl bg-card/90 backdrop-blur border border-border p-3 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm text-foreground">Analyzing card…</p>
            </div>
          </div>
        )}

        {/* Idle CTA overlay */}
        {stage === "idle" && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-end pb-6 group bg-gradient-to-t from-background/80 via-background/0 to-background/0 transition"
            aria-label="Upload a card photo to scan"
          >
            <span className="rounded-full gradient-primary text-primary-foreground px-5 py-3 text-sm font-display font-semibold flex items-center gap-2 shadow-lg group-hover:scale-105 transition-transform">
              <Upload className="w-4 h-4" />
              Scan your card
            </span>
            <span className="mt-2 text-xs text-muted-foreground bg-card/80 backdrop-blur rounded-full px-3 py-1">
              Free · Pokémon, Magic, Yu-Gi-Oh!, Sports
            </span>
          </button>
        )}

        {/* Graded result */}
        {stage === "graded" && (
          <>
            <div className="absolute top-4 right-4 transition-all duration-500">
              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-lg glow-purple">
                <div className="text-center">
                  <p className="text-xs font-bold text-primary-foreground leading-none">
                    {gradeLetters}
                  </p>
                  <p className="text-lg font-display font-bold text-primary-foreground leading-none">
                    {gradeNum}
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4">
              <div className="rounded-xl bg-card/90 backdrop-blur border border-border p-3 shadow-lg">
                <p className="text-xs text-muted-foreground">Estimated Value</p>
                <p className="text-xl font-display font-bold text-gradient-primary">
                  {valueLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={reset}
              className="absolute top-4 left-4 rounded-full bg-card/90 backdrop-blur border border-border px-3 py-1.5 text-xs font-medium flex items-center gap-1 shadow hover:bg-card transition"
              aria-label="Scan another card"
            >
              <RotateCcw className="w-3 h-3" />
              New scan
            </button>
          </>
        )}

        {/* Error state */}
        {stage === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur p-6 text-center">
            <p className="text-sm text-foreground font-medium">{errorMsg}</p>
            <button
              type="button"
              onClick={reset}
              className="rounded-full gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanDemo;
