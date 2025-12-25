import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Loader2, Check, Sparkles } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const Scan = () => {
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });
  }, [navigate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setResult(null);
    }
  };

  const analyzeCard = async () => {
    if (!file || !user) return;
    setAnalyzing(true);
    try {
      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("card-images").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("card-images").getPublicUrl(filePath);

      const { data, error } = await supabase.functions.invoke("analyze-card", { body: { imageUrl: publicUrl } });
      if (error) throw error;

      setResult({ ...data, imageUrl: publicUrl, filePath });
      toast({ title: "Analysis complete!", description: `Identified: ${data.cardName}` });
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
      const { error } = await supabase.from("cards").insert({
        user_id: user.id,
        image_url: result.imageUrl,
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/dashboard"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <h1 className="text-xl font-display font-bold">Scan Card</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {!result ? (
          <div className="space-y-6">
            <label className="block border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors">
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              {preview ? (
                <img src={preview} alt="Preview" className="max-h-80 mx-auto rounded-lg" />
              ) : (
                <>
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Click or drag to upload a card image</p>
                </>
              )}
            </label>

            {preview && (
              <Button onClick={analyzeCard} disabled={analyzing} className="w-full gradient-primary py-6 text-lg">
                {analyzing ? <><Loader2 className="mr-2 w-5 h-5 animate-spin" />Analyzing...</> : <><Sparkles className="mr-2 w-5 h-5" />Analyze Card</>}
              </Button>
            )}
          </div>
        ) : (
          <div className="animate-celebrate space-y-6">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <img src={preview!} alt="Card" className="w-full max-h-64 object-contain bg-muted" />
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

            <div className="flex gap-4">
              <Button onClick={saveToCollection} disabled={saving} className="flex-1 gradient-primary">
                {saving ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Check className="mr-2 w-4 h-4" />}
                Add to Collection
              </Button>
              <Button variant="outline" onClick={() => { setResult(null); setPreview(null); setFile(null); }}>Scan Another</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Scan;
