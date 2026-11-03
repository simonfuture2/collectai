import { trackAgentEvent } from "@/lib/agentRef";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Upload, Loader2, RotateCcw, BookmarkPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DEMO_SAMPLES, SAMPLE_SCAN_MS, type DemoSample } from "@/lib/demoSamples";
import { downscalePhoto, saveDemoCard } from "@/lib/demoCard";
import charizardCard from "@/assets/scan-demo-charizard.jpeg";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Stage = "idle" | "scanning" | "graded" | "error" | "limit";

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
  pricedFrom?: "market" | "estimate";
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

export interface ScanDemoHandle { openPicker: () => void }

const ScanDemo = forwardRef<ScanDemoHandle>((_props, ref) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string>(charizardCard);
  const [usingDefault, setUsingDefault] = useState(true);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isSample, setIsSample] = useState(false);
  const [saving, setSaving] = useState(false);
  const sampleTimer = useRef<number | null>(null);
  const navigate = useNavigate();

  useImperativeHandle(ref, () => ({ openPicker: () => fileRef.current?.click() }), []);

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
    setIsSample(false);
    if (sampleTimer.current) clearTimeout(sampleTimer.current);
    setStage("idle");
  };

  const playSample = (sample: DemoSample) => {
    if (stage === "scanning") return;
    void trackAgentEvent("demo_sample_tap", { sample: sample.id });
    if (!usingDefault && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    if (sampleTimer.current) clearTimeout(sampleTimer.current);
    setPreviewUrl(sample.image);
    setUsingDefault(true);
    setResult(null);
    setErrorMsg("");
    setIsSample(true);
    setStage("scanning");
    sampleTimer.current = window.setTimeout(() => { setResult(sample.result); setStage("graded"); }, SAMPLE_SCAN_MS);
  };

  const saveCard = async () => {
    if (!result || isSample) return;
    setSaving(true);
    void trackAgentEvent("save_card_click");
    try {
      const photo = await downscalePhoto(previewUrl);
      await saveDemoCard({ at: Date.now(), result: result as Record<string, unknown>, photo });
    } catch { /* still send them to sign up */ }
    navigate("/auth?mode=signup&from=demo&next=/dashboard");
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
    setIsSample(false);
    setStage("scanning");
    void trackAgentEvent("demo_upload_started");

    try {
      const imageBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("demo-scan", {
        body: { imageBase64, mimeType: file.type },
      });

      if (error) {
        // Try to surface server JSON error message
        const ctx = (error as any).context;
        let msg = error.message || "Scan failed";
        const status = ctx?.status;
        let parsedBody: any = null;
        try { parsedBody = ctx && (await ctx.clone?.().json?.()); } catch { /* ignore */ }
        if (status === 429 || parsedBody?.rateLimited) {
          void trackAgentEvent("demo_limit_hit");
          setStage("limit");
          return;
        }
        void trackAgentEvent("demo_error", { status: status ?? null });
        if (status === 500 || status === 502) {
          setErrorMsg("Our scanner is busy. Try again in a moment. This didn't use one of your free scans.");
          setStage("error");
          return;
        }
        try {
          const parsed = ctx && (await ctx.json?.());
          if (parsed?.error) msg = parsed.error;
        } catch { /* ignore */ }
        setErrorMsg(msg);
        setStage("error");
        return;
      }

      if (!data?.success || !data?.data) {
        void trackAgentEvent("demo_error", { reason: "no_result" });
        setErrorMsg(data?.error || "SI couldn't analyze that image.");
        setStage("error");
        return;
      }
      void trackAgentEvent("demo_scan");
      void trackAgentEvent("demo_result");


      setResult(data.data as DemoResult);
      setStage("graded");
    } catch (e: any) {
      void trackAgentEvent("demo_error", { reason: "exception" });
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
    <div className="w-full max-w-sm mx-auto">
    <div className="relative w-full aspect-[3/4]">
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
              Free · Any TCG, sports cards & slabs
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
                {isSample && <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Sample result</p>}
                {result?.pricedFrom && (
                  <p className="text-[10px] text-muted-foreground">
                    {result.pricedFrom === "market" ? "Based on recent sold comps" : "SI estimate, sign up for live comps"}
                  </p>
                )}
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

        {/* Daily demo limit */}
        {stage === "limit" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur p-6 text-center">
            <p className="font-display text-lg font-bold">You've used today's 3 free demo scans.</p>
            <p className="text-sm text-muted-foreground">Create a free account to keep scanning.</p>
            <button type="button" onClick={() => navigate("/auth?mode=signup&from=demo")}
              className="rounded-full gradient-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold shadow">
              Create free account
            </button>
          </div>
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

    {stage === "graded" && result && !isSample && (
      <div className="mt-3 rounded-2xl border border-primary/40 bg-card p-4 text-left shadow">
        <p className="font-display font-bold">Save this card to your collection</p>
        <p className="mt-1 text-sm text-muted-foreground">Create a free account and this card – with its value and grade – is waiting for you.</p>
        <button type="button" onClick={saveCard} disabled={saving}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />} Save it free
        </button>
      </div>
    )}

    <div className="mt-4">
      <p className="text-xs text-muted-foreground text-center">No card handy? Try one:</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {DEMO_SAMPLES.map(s => (
          <button key={s.id} type="button" onClick={() => playSample(s)} aria-label={`Try a sample ${s.label} card`}
            className="group rounded-lg border border-border bg-card p-1 transition hover:border-primary">
            <img src={s.image} alt="" className="aspect-[63/88] w-full rounded object-cover" loading="lazy" />
            <span className="mt-1 block truncate text-[10px] text-muted-foreground group-hover:text-foreground">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
    </div>
  );
});

ScanDemo.displayName = "ScanDemo";

export default ScanDemo;
