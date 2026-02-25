import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Loader2, Check, Sparkles, Plus, X, RotateCcw } from "lucide-react";
import AIDisclaimer from "@/components/AIDisclaimer";
import Footer from "@/components/Footer";
import type { Session, User } from "@supabase/supabase-js";
import { useCredits } from "@/hooks/use-credits";
import CreditBalance from "@/components/CreditBalance";
import UpgradeModal from "@/components/UpgradeModal";
import ThemeToggle from "@/components/ThemeToggle";

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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [slots, setSlots] = useState<ImageSlot[]>(DEFAULT_SLOTS);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [uploadedFilePaths, setUploadedFilePaths] = useState<string[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
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
        prev.map((s) =>
          s.id === slotId ? { ...s, file: f, preview: URL.createObjectURL(f) } : s
        )
      );
      setResult(null);
    }
  };

  const removeImage = (slotId: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, file: null, preview: null } : s))
    );
  };

  const addSlot = () => {
    const num = slots.length + 1;
    setSlots((prev) => [
      ...prev,
      { id: `extra-${Date.now()}`, label: `View ${num}`, file: null, preview: null },
    ]);
  };

  const removeSlot = (slotId: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
  };

  const filledSlots = slots.filter((s) => s.file !== null);
  const hasImages = filledSlots.length > 0;

  const analyzeCard = async () => {
    if (!hasImages) return;

    if (!canScan) {
      setShowUpgrade(true);
      return;
    }

    const accessToken = session?.access_token;
    if (!accessToken || !user) {
      toast({
        title: "Please sign in",
        description: "Your session isn't available. Sign in again to analyze cards.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    setAnalyzing(true);
    try {
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      const accessTokenFresh = refreshedSession?.access_token ?? session?.access_token;
      if (!accessTokenFresh) throw new Error("You must be logged in to analyze.");

      // Upload all images and get signed URLs
      const imageEntries: { label: string; url: string; filePath: string }[] = [];

      for (const slot of filledSlots) {
        const filePath = `${user.id}/${Date.now()}-${slot.id}-${slot.file!.name}`;
        const { error: uploadError } = await supabase.storage.from("card-images").upload(filePath, slot.file!);
        if (uploadError) throw uploadError;

        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("card-images")
          .createSignedUrl(filePath, 3600);
        if (urlError) throw urlError;

        imageEntries.push({
          label: slot.label,
          url: signedUrlData.signedUrl,
          filePath,
        });
      }

      setUploadedFilePaths(imageEntries.map((e) => e.filePath));

      const { data, error } = await supabase.functions.invoke("analyze-card", {
        body: {
          images: imageEntries.map((e) => ({ label: e.label, url: e.url })),
          // Keep backward compat
          imageUrl: imageEntries[0].url,
        },
        headers: { Authorization: `Bearer ${accessTokenFresh}` },
      });
      if (error) throw error;

      setResult({ ...data, filePaths: imageEntries.map((e) => e.filePath) });
      toast({ title: "Analysis complete!", description: `Identified: ${data.cardName}` });
      refreshCredits();
    } catch (error: any) {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const saveToCollection = async () => {
    if (!result || !user) return;
    setSaving(true);
    try {
      const primaryPath = result.filePaths?.[0] || uploadedFilePaths[0];
      const { error } = await supabase.from("cards").insert({
        user_id: user.id,
        image_url: primaryPath,
        category: result.category || "Trading Card",
        card_name: result.cardName,
        card_set: result.cardSet,
        card_year: result.cardYear,
        edition: result.edition,
        rarity: result.rarity,
        condition_grade: result.conditionGrade,
        special_features: result.specialFeatures || [],
        estimated_value_low: result.estimatedValueLow,
        estimated_value_high: result.estimatedValueHigh,
        ebay_recent_sales: result.ebayRecentSales,
        tcgplayer_price: result.tcgplayerPrice,
        psa_population_data: result.psaPopulation,
        ai_analysis: result,
      });
      if (error) throw error;
      toast({ title: "Card saved!" });
      navigate("/collection");
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetScan = () => {
    setResult(null);
    setSlots(DEFAULT_SLOTS.map((s) => ({ ...s, file: null, preview: null })));
    setUploadedFilePaths([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <h1 className="text-xl font-display font-bold">Scan Item</h1>
          </div>
          <CreditBalance credits={credits} isPro={isPro} loading={creditsLoading} />
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {!result ? (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
              Upload the front & back of a card, or multiple views of any collectible for the best analysis.
            </p>

            {/* Image slots grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {slots.map((slot) => (
                <div key={slot.id} className="relative group">
                  <label className="block border-2 border-dashed border-border rounded-xl aspect-[3/4] cursor-pointer hover:border-primary/50 transition-colors overflow-hidden">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(slot.id, e)}
                      className="hidden"
                    />
                    {slot.preview ? (
                      <img src={slot.preview} alt={slot.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Upload className="w-8 h-8 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">{slot.label}</span>
                      </div>
                    )}
                  </label>

                  {/* Label badge */}
                  <span className="absolute top-2 left-2 text-[10px] font-semibold bg-primary/90 text-primary-foreground px-2 py-0.5 rounded-full">
                    {slot.label}
                  </span>

                  {/* Remove image button */}
                  {slot.preview && (
                    <button
                      onClick={() => removeImage(slot.id)}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}

                  {/* Remove slot button (only for extra slots) */}
                  {slot.id !== "front" && slot.id !== "back" && !slot.preview && (
                    <button
                      onClick={() => removeSlot(slot.id)}
                      className="absolute top-2 right-2 bg-muted text-muted-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add more slot */}
              <button
                onClick={addSlot}
                className="border-2 border-dashed border-border rounded-xl aspect-[3/4] flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary"
              >
                <Plus className="w-8 h-8" />
                <span className="text-xs font-medium">Add View</span>
              </button>
            </div>

            {hasImages && (
              <Button onClick={analyzeCard} disabled={analyzing} className="w-full gradient-primary py-6 text-lg">
                {analyzing ? (
                  <><Loader2 className="mr-2 w-5 h-5 animate-spin" />Analyzing {filledSlots.length} image{filledSlots.length > 1 ? "s" : ""}...</>
                ) : (
                  <><Sparkles className="mr-2 w-5 h-5" />Analyze ({filledSlots.length} image{filledSlots.length > 1 ? "s" : ""})</>
                )}
              </Button>
            )}
          </div>
        ) : (
          <div className="animate-celebrate space-y-6">
            {/* Show uploaded images carousel */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {filledSlots.map((slot) => (
                <div key={slot.id} className="flex-shrink-0 relative">
                  <img
                    src={slot.preview!}
                    alt={slot.label}
                    className="h-40 rounded-lg border border-border object-cover"
                  />
                  <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-primary/90 text-primary-foreground px-2 py-0.5 rounded-full">
                    {slot.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-6 space-y-4">
                <div>
                  <h2 className="text-2xl font-display font-bold">{result.cardName}</h2>
                  <p className="text-muted-foreground">{result.cardSet} • {result.cardYear}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Edition:</span> {result.edition}</div>
                  <div><span className="text-muted-foreground">Rarity:</span> {result.rarity}</div>
                  <div><span className="text-muted-foreground">Condition:</span> {result.conditionGrade}</div>
                  <div><span className="text-muted-foreground">Trend:</span> {result.valueTrend}</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground mb-1">Estimated Value</p>
                  <p className="text-3xl font-display font-bold text-gradient-primary">
                    ${result.estimatedValueLow?.toFixed(0)} - ${result.estimatedValueHigh?.toFixed(0)}
                  </p>
                </div>
              </div>
            </div>
            <AIDisclaimer />

            <div className="flex gap-4">
              <Button onClick={saveToCollection} disabled={saving} className="flex-1 gradient-primary">
                {saving ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Check className="mr-2 w-4 h-4" />}
                Add to Collection
              </Button>
              <Button variant="outline" onClick={resetScan}>
                <RotateCcw className="mr-2 w-4 h-4" />Scan Another
              </Button>
            </div>
          </div>
        )}
      </main>
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} feature="AI card scanning" />
      <Footer />
    </div>
  );
};

export default Scan;
