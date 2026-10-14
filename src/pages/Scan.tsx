import BetaEndedPrompt from "@/components/BetaEndedPrompt";
import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Camera, Loader2, Sparkles, Plus, X, Zap, ScanSearch, Barcode } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ScanTimeline from "@/components/ScanTimeline";
import Footer from "@/components/Footer";
import type { Session, User } from "@supabase/supabase-js";
import { useCredits } from "@/hooks/use-credits";
import CreditBalance from "@/components/CreditBalance";
import UpgradeModal from "@/components/UpgradeModal";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import CameraWarmup from "@/components/CameraWarmup";
import { cn } from "@/lib/utils";
import BarcodeScanner from "@/components/sealed/BarcodeScanner";

const WARMUP_KEY = "mca-camera-warmup-seen";
const EVENT_KEY = "mca-insight-event";

type Mode = "collection" | "insight";
type ItemType = "card" | "slab" | "sealed";

const SEALED_SLOTS: ImageSlot[] = [
  { id: "front", label: "Front of package", file: null, preview: null },
  { id: "barcode", label: "Barcode (optional)", file: null, preview: null },
];

interface ImageSlot {
  id: string;
  label: string;
  file: File | null;
  preview: string | null;
}

const DEFAULT_SLOTS: ImageSlot[] = [
  { id: "front", label: "Front", file: null, preview: null },
  { id: "back", label: "Back", file: null, preview: null },
];

const Scan = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: Mode = searchParams.get("mode") === "insight" ? "insight" : "collection";
  const isInsight = mode === "insight";
  const setMode = (m: Mode) => setSearchParams({ mode: m }, { replace: true });

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [slots, setSlots] = useState<ImageSlot[]>(DEFAULT_SLOTS);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [fastScan, setFastScan] = useState(false);
  const [itemType, setItemTypeState] = useState<ItemType>("card");
  const isSlab = itemType === "slab";
  const isSealed = itemType === "sealed";
  const [upc, setUpc] = useState("");
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const setItemType = (t: ItemType) => {
    if ((t === "sealed") !== isSealed) setSlots(t === "sealed" ? SEALED_SLOTS : DEFAULT_SLOTS);
    setItemTypeState(t);
  };
  const [askingPrice, setAskingPrice] = useState("");
  const [eventName, setEventName] = useState(() => {
    try { return sessionStorage.getItem(EVENT_KEY) || ""; } catch { return ""; }
  });
  const [showWarmup, setShowWarmup] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return !localStorage.getItem(WARMUP_KEY); } catch { return false; }
  });

  const dismissWarmup = () => {
    try { localStorage.setItem(WARMUP_KEY, "1"); } catch {/* ignore */}
    setShowWarmup(false);
  };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { credits, isPro, canScan, loading: creditsLoading, refresh: refreshCredits } = useCredits();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) navigate("/auth");
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      if (!existingSession?.user) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleFileChange = (slotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setSlots((prev) =>
        prev.map((s) => (s.id === slotId ? { ...s, file: f, preview: URL.createObjectURL(f) } : s))
      );
    }
  };

  const removeImage = (slotId: string) => {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, file: null, preview: null } : s)));
  };

  const addSlot = () => {
    const num = slots.length + 1;
    setSlots((prev) => [...prev, { id: `extra-${Date.now()}`, label: `View ${num}`, file: null, preview: null }]);
  };

  const removeSlot = (slotId: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
  };

  const filledSlots = slots.filter((s) => s.file !== null);
  const hasImages = filledSlots.length > 0;

  const analyzeCard = async () => {
    if (!hasImages) return;

    let allowed = canScan;
    if (creditsLoading) {
      await refreshCredits();
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        try {
          const { data } = await supabase.functions.invoke("check-subscription");
          allowed = (data?.plan === "pro") || data?.subscribed || !!data?.beta_active || (data?.credits ?? 0) > 0;
        } catch { /* fall back to existing flag */ }
      }
    }

    if (!allowed) {
      setShowUpgrade(true);
      return;
    }

    let asking: number | null = null;
    if (isInsight && askingPrice.trim()) {
      const n = Number(askingPrice.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        toast({ title: "Check the asking price", description: "Enter a number like 45 or 45.50.", variant: "destructive" });
        return;
      }
      asking = n;
    }
    const eventTrimmed = eventName.trim().slice(0, 80);
    if (isInsight) {
      try { sessionStorage.setItem(EVENT_KEY, eventTrimmed); } catch {/* ignore */}
    }

    const accessToken = session?.access_token;
    if (!accessToken || !user) {
      toast({ title: "Please sign in", description: "Your session isn't available. Sign in again to analyze cards.", variant: "destructive" });
      navigate("/auth");
      return;
    }

    setAnalyzing(true);
    setScanDone(false);
    try {
      // A failed refresh shouldn't block the scan when the current token is still valid.
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } } as any));

      const accessTokenFresh = refreshedSession?.access_token ?? session?.access_token;
      if (!accessTokenFresh) throw new Error("You must be logged in to analyze.");

      const imageEntries: { label: string; url: string; filePath: string }[] = [];
      for (const slot of filledSlots) {
        const filePath = `${user.id}/${Date.now()}-${slot.id}-${slot.file!.name}`;
        const { error: uploadError } = await supabase.storage.from("card-images").upload(filePath, slot.file!);
        if (uploadError) throw uploadError;
        const { data: signedUrlData, error: urlError } = await supabase.storage.from("card-images").createSignedUrl(filePath, 3600);
        if (urlError) throw urlError;
        imageEntries.push({ label: slot.label, url: signedUrlData.signedUrl, filePath });
      }
      const images = imageEntries.map((e) => ({ label: e.label, url: e.url }));

      const { data, error } = await supabase.functions.invoke("identify-card", {
        body: {
          images,
          imageUrl: imageEntries[0].url,
          fastScan,
          scanPurpose: mode,
          itemType,
          ...(isSealed && upc.replace(/\D/g, "").length >= 8 ? { upc: upc.replace(/\D/g, "") } : {}),
          ...(isInsight ? { askingPrice: asking, insightEvent: eventTrimmed || null } : {}),
        },
        headers: { Authorization: `Bearer ${accessTokenFresh}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.cardId) throw new Error("Scan failed — no card id returned");

      if (isSlab && !data.duplicate) {
        const { error: slabErr } = await supabase.functions.invoke("scan-slab", {
          body: { cardId: data.cardId, images },
          headers: { Authorization: `Bearer ${accessTokenFresh}` },
        });
        if (slabErr) toast({ title: "Couldn't read the slab label", description: "Showing raw-card pricing instead." });
      }

      setScanDone(true);
      refreshCredits();
      toast({
        title: data.duplicate ? "Card already in collection" : isInsight ? "Getting insights" : "Card uploaded!",
        description: data.duplicate ? undefined : "SI is identifying and pricing in the background.",
      });
      navigate(data.duplicate ? `/card/${data.cardId}` : `/scan/reveal/${data.cardId}`);
    } catch (error: any) {
      toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <BetaEndedPrompt className="mx-3 mt-3 sm:mx-auto sm:max-w-3xl" />
      <SEO
        title="Scan a Card – SI Grading & Value | MyCollectAI"
        description="Upload card photos to get instant SI identification, condition grading, and live market value estimates."
        path="/scan"
        noIndex
      />
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <div className="min-w-0">
              <h1 className={cn("text-xl font-display font-bold truncate", isInsight && "text-secondary")}>
                {isInsight ? "Insight Scan" : "Scan to Collection"}
              </h1>
              {isInsight && (
                <p className="text-xs text-muted-foreground leading-snug">Won't be added to your collection. You can add it later.</p>
              )}
            </div>
          </div>
          <CreditBalance credits={credits} isPro={isPro} loading={creditsLoading} />
          <ThemeToggle />
        </div>
      </header>

      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border/60">
        <div className="container mx-auto px-4 py-2 max-w-3xl">
          <div role="tablist" aria-label="Scan mode" className="grid grid-cols-2 rounded-xl bg-muted p-1">
            {(["collection", "insight"] as Mode[]).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  disabled={analyzing}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-lg py-2 text-sm font-semibold transition-colors",
                    active
                      ? m === "collection" ? "gradient-primary text-white shadow" : "bg-secondary text-secondary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "collection" ? "Collection" : "Insights"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {showWarmup ? (
          <CameraWarmup onContinue={dismissWarmup} onSkip={dismissWarmup} />
        ) : (
          <div className="space-y-6">
            <div role="radiogroup" aria-label="What are you scanning?" className="grid grid-cols-3 rounded-xl bg-muted p-1">
              {([["card", "Card"], ["slab", "Graded slab"], ["sealed", "Sealed pack/box"]] as [ItemType, string][]).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={itemType === v}
                  disabled={analyzing}
                  onClick={() => setItemType(v)}
                  className={cn(
                    "rounded-lg px-1 py-2 text-xs sm:text-sm font-semibold leading-tight transition-colors",
                    itemType === v
                      ? isInsight ? "bg-secondary text-secondary-foreground shadow" : "gradient-primary text-white shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            <p className="text-muted-foreground text-sm">
              {isSealed
                ? "Photograph the front so the set logo is readable. Add the barcode for an exact match."
                : "Upload the front & back of a card, or multiple views of any collectible for the best analysis."}
            </p>

            {isSealed && (
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <Label htmlFor="upc" className="text-sm font-semibold">Barcode (optional)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input id="upc" inputMode="numeric" maxLength={14} placeholder="Type the digits" value={upc} onChange={(e) => setUpc(e.target.value.replace(/\D/g, ""))} className="font-numeric pr-8" />
                    {upc && (
                      <button type="button" aria-label="Clear barcode" onClick={() => setUpc("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <Button type="button" variant="outline" onClick={() => setBarcodeOpen(true)}>
                    <Barcode className="w-4 h-4 mr-1.5" /> Scan barcode
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {slots.map((slot) => (
                <div key={slot.id} className="relative group">
                  <div className={cn("block border-2 border-dashed border-border rounded-xl aspect-[3/4] transition-colors overflow-hidden", isInsight ? "hover:border-secondary/50" : "hover:border-primary/50")}>
                    {slot.preview ? (
                      <label className="block w-full h-full cursor-pointer">
                        <input type="file" accept="image/*" onChange={(e) => handleFileChange(slot.id, e)} className="hidden" />
                        <img src={slot.preview} alt={`Card ${slot.label} view`} className="w-full h-full object-cover" />
                      </label>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-2 p-2">
                        <span className="text-xs text-muted-foreground font-medium">{slot.label}</span>
                        <label className={cn("flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold cursor-pointer", isInsight ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground")}>
                          <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileChange(slot.id, e)} className="hidden" />
                          <Camera className="w-4 h-4" /> Take photo
                        </label>
                        <label className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted">
                          <input type="file" accept="image/*" onChange={(e) => handleFileChange(slot.id, e)} className="hidden" />
                          <Upload className="w-4 h-4" /> Upload
                        </label>
                      </div>
                    )}
                  </div>
                  <span className={cn("absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full", isInsight ? "bg-secondary/90 text-secondary-foreground" : "bg-primary/90 text-primary-foreground")}>
                    {slot.label}
                  </span>
                  {slot.preview && (
                    <button onClick={() => removeImage(slot.id)} aria-label="Remove photo" className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {slot.id.startsWith("extra-") && !slot.preview && (
                    <button onClick={() => removeSlot(slot.id)} aria-label="Remove view" className="absolute top-2 right-2 bg-muted text-muted-foreground rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {!isSealed && <button onClick={addSlot} className="border-2 border-dashed border-border rounded-xl aspect-[3/4] flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary">
                <Plus className="w-8 h-8" />
                <span className="text-xs font-medium">Add View</span>
              </button>}
            </div>

            {hasImages && !analyzing && (
              <div className="space-y-3">
                {filledSlots.length === 1 && filledSlots[0].id === "front" && itemType === "card" && (
                  <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
                    <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Front-only image detected</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Our SI can identify and price your card from the front alone. For the most accurate grading and condition analysis, add a back photo too.
                      </p>
                    </div>
                  </div>
                )}

                {isInsight && (
                  <div className="space-y-4 rounded-xl border border-secondary/30 bg-secondary/5 p-4">
                    <div>
                      <Label htmlFor="asking-price" className="text-sm font-semibold">Asking price (optional)</Label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input id="asking-price" inputMode="decimal" placeholder="0.00" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} className="pl-7" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="insight-event" className="text-sm font-semibold">Where are you? (optional)</Label>
                      <Input id="insight-event" maxLength={80} placeholder="e.g. Philly Card Show" value={eventName} onChange={(e) => setEventName(e.target.value)} className="mt-1.5" />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <Zap className={`w-5 h-5 mt-0.5 ${fastScan ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <Label htmlFor="fast-scan" className="text-sm font-semibold cursor-pointer">Fast Scan</Label>
                      <p className="text-xs text-muted-foreground">
                        Skip cross-verification and extra market search rounds. Faster, slightly less precise pricing.
                      </p>
                    </div>
                  </div>
                  <Switch id="fast-scan" checked={fastScan} onCheckedChange={setFastScan} />
                </div>

                <Button
                  onClick={analyzeCard}
                  disabled={analyzing || creditsLoading}
                  className={cn("w-full py-6 text-lg", isInsight ? "bg-secondary text-secondary-foreground hover:bg-secondary/90" : "gradient-primary")}
                >
                  {creditsLoading ? <Loader2 className="mr-2 w-5 h-5 animate-spin" /> : isInsight ? <ScanSearch className="mr-2 w-5 h-5" /> : <Sparkles className="mr-2 w-5 h-5" />}
                  {creditsLoading
                    ? "Checking access…"
                    : isSealed
                    ? "Find chase cards"
                    : isInsight
                    ? "Get Insights"
                    : `Analyze (${filledSlots.length} image${filledSlots.length > 1 ? "s" : ""})`}
                </Button>
              </div>
            )}

            {analyzing && <ScanTimeline running={analyzing} done={scanDone} />}
          </div>
        )}
      </main>
      <BarcodeScanner open={barcodeOpen} onOpenChange={setBarcodeOpen} onResult={setUpc} />
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} feature="SI card scanning" />
      <Footer />
    </div>
  );
};

export default Scan;
