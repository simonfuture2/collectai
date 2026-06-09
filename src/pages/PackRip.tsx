import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Sparkles,
  Plus,
  Package,
  TrendingUp,
  TrendingDown,
  Trophy,
  Share2,
  X,
} from "lucide-react";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import CreditBalance from "@/components/CreditBalance";
import UpgradeModal from "@/components/UpgradeModal";
import { useCredits } from "@/hooks/use-credits";
import type { Session, User } from "@supabase/supabase-js";

interface Pull {
  cardName: string;
  cardSet?: string;
  rarity?: string;
  estimatedValueLow?: number;
  estimatedValueHigh?: number;
  imagePath?: string;
  imagePreview?: string;
  cardId?: string;
  isChase?: boolean;
}

const avgValue = (p: Pull) =>
  ((p.estimatedValueLow || 0) + (p.estimatedValueHigh || 0)) / 2;

const isChasePull = (p: Pull): boolean => {
  const r = (p.rarity || "").toLowerCase();
  return avgValue(p) >= 50 || /holo|secret|rainbow|gold|alt|hyper|chase|ultra rare/.test(r);
};

const PackRip = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [setName, setSetName] = useState("");
  const [retailCost, setRetailCost] = useState("");
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [celebration, setCelebration] = useState<Pull | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { credits, isPro, canScan, loading: creditsLoading, refresh: refreshCredits } = useCredits();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) navigate("/auth");
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) navigate("/auth");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const totalValue = pulls.reduce((s, p) => s + avgValue(p), 0);
  const retail = parseFloat(retailCost) || 0;
  const profit = totalValue - retail;
  const bestPull = pulls.reduce<Pull | null>(
    (best, p) => (!best || avgValue(p) > avgValue(best) ? p : best),
    null
  );

  const handleScan = async (file: File) => {
    if (!user || !session) return;
    if (!canScan) {
      setShowUpgrade(true);
      return;
    }

    setScanning(true);
    try {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      const token = refreshed?.access_token ?? session.access_token;

      const filePath = `${user.id}/${Date.now()}-rip-${file.name}`;
      const { error: upErr } = await supabase.storage.from("card-images").upload(filePath, file);
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from("card-images")
        .createSignedUrl(filePath, 3600);
      if (!signed) throw new Error("Could not create signed URL");

      const { data, error } = await supabase.functions.invoke("analyze-card", {
        body: {
          images: [{ label: "Front", url: signed.signedUrl }],
          imageUrl: signed.signedUrl,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;

      const newPull: Pull = {
        cardName: data.cardName || "Unknown card",
        cardSet: data.cardSet,
        rarity: data.rarity,
        estimatedValueLow: data.estimatedValueLow,
        estimatedValueHigh: data.estimatedValueHigh,
        imagePath: filePath,
        imagePreview: URL.createObjectURL(file),
        cardId: data.cardId,
      };
      newPull.isChase = isChasePull(newPull);

      setPulls((prev) => [...prev, newPull]);
      refreshCredits();

      if (newPull.isChase) {
        setCelebration(newPull);
        setTimeout(() => setCelebration(null), 3500);
      } else {
        toast({
          title: `Pulled: ${newPull.cardName}`,
          description: `Est. $${avgValue(newPull).toFixed(0)}`,
        });
      }
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePull = (idx: number) => {
    setPulls((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveSession = async () => {
    if (!user || pulls.length === 0) return;
    if (!setName.trim()) {
      toast({ title: "Name your pack", description: "Enter a set name first", variant: "destructive" });
      return;
    }
    setSavingSession(true);
    try {
      const { data, error } = await supabase
        .from("pack_rips")
        .insert({
          user_id: user.id,
          set_name: setName.trim(),
          retail_cost: retail || null,
          pulls: pulls as any,
          total_value: totalValue,
          best_pull_name: bestPull?.cardName || null,
          best_pull_value: bestPull ? avgValue(bestPull) : null,
        })
        .select("id, share_token")
        .single();
      if (error) throw error;

      toast({ title: "Pack saved!", description: `Total value: $${totalValue.toFixed(0)}` });
      navigate("/collection");
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingSession(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pack Rip – Log Your Pulls Instantly | MyCollectAI"
        description="Capture every pack you open. AI identifies each pull, totals the value, and tracks your hit rate."
        path="/pack-rip"
        noIndex
      />
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-display font-bold">Pack Rip Mode</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <CreditBalance credits={credits} isPro={isPro} loading={creditsLoading} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        {/* Setup */}
        <section className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="set">Set / Product</Label>
            <Input
              id="set"
              placeholder="e.g. Surging Sparks Booster Box"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="retail">Retail cost (optional)</Label>
            <Input
              id="retail"
              type="number"
              step="0.01"
              placeholder="$ paid"
              value={retailCost}
              onChange={(e) => setRetailCost(e.target.value)}
            />
          </div>
        </section>

        {/* Live tally */}
        <section className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Pulls</p>
            <p className="text-2xl font-display font-bold">{pulls.length}</p>
          </div>
          <div className="gradient-primary rounded-xl p-4">
            <p className="text-xs text-white/80">Pack Value</p>
            <p className="text-2xl font-display font-bold text-white">${totalValue.toFixed(0)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {profit >= 0 ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
              vs retail
            </p>
            <p className={`text-2xl font-display font-bold ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
              {retail > 0 ? `${profit >= 0 ? "+" : ""}$${profit.toFixed(0)}` : "—"}
            </p>
          </div>
        </section>

        {/* Scan card */}
        <section>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleScan(f);
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className="w-full gradient-primary py-6 text-lg"
          >
            {scanning ? (
              <><Loader2 className="mr-2 w-5 h-5 animate-spin" /> Identifying pull...</>
            ) : (
              <><Plus className="mr-2 w-5 h-5" /> Scan next pull</>
            )}
          </Button>
        </section>

        {/* Pulls list */}
        {pulls.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-lg">Your pulls</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {pulls.map((p, i) => (
                <div
                  key={i}
                  className={`relative bg-card border rounded-xl p-3 flex gap-3 items-center ${
                    p.isChase ? "border-primary/50 glow-purple" : "border-border"
                  }`}
                >
                  {p.imagePreview && (
                    <img src={p.imagePreview} alt={p.cardName} className="w-14 h-20 object-cover rounded-md" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {p.isChase && <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />}
                      <p className="font-semibold truncate">{p.cardName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.cardSet} • {p.rarity}</p>
                    <p className="text-sm font-bold text-gradient-primary">
                      ${avgValue(p).toFixed(0)}
                    </p>
                  </div>
                  <button
                    onClick={() => removePull(i)}
                    className="absolute top-1 right-1 p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remove pull"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {pulls.length > 0 && (
          <Button
            onClick={saveSession}
            disabled={savingSession}
            variant="outline"
            className="w-full"
          >
            {savingSession ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Trophy className="mr-2 w-4 h-4" />}
            Finish & Save Pack
          </Button>
        )}

        {pulls.length === 0 && !scanning && (
          <div className="text-center py-12 bg-card border border-dashed border-border rounded-2xl">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Open a pack? Scan each card you pull and we'll tally the total value, flag chase hits, and save the rip.
            </p>
          </div>
        )}
      </main>

      {/* Chase celebration overlay */}
      {celebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="text-center animate-scale-in">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full gradient-primary glow-purple mb-4 animate-pulse">
              <Sparkles className="w-12 h-12 text-primary-foreground" />
            </div>
            <p className="text-sm uppercase tracking-widest text-primary font-bold">Chase Hit!</p>
            <h2 className="text-3xl font-display font-bold mt-2">{celebration.cardName}</h2>
            <p className="text-2xl font-display font-bold text-gradient-primary mt-2">
              ${avgValue(celebration).toFixed(0)}
            </p>
          </div>
        </div>
      )}

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} feature="AI card scanning" />
      <Footer />
    </div>
  );
};

export default PackRip;
