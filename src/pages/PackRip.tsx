import PriceChartingAttribution from "@/components/PriceChartingAttribution";
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Sparkles, Plus, Package, Trophy, X } from "lucide-react";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import SEO from "@/components/SEO";
import UpgradeModal from "@/components/UpgradeModal";
import { usePriceCheckAccess } from "@/hooks/use-price-check-access";
import { useCredits } from "@/hooks/use-credits";
import { chaseHit, packSummary, priceOnlyCard, pullValue, sortedPulls, storedPulls, type PackPull } from "@/lib/packRip";
import type { User } from "@supabase/supabase-js";
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const message = (e: unknown) => e instanceof Error ? e.message : "Please try again.";

const PackRip = () => {
  const [user, setUser] = useState<User | null>(null);
  const [params, setParams] = useSearchParams();
  const ripId = params.get("rip");
  const [setName, setSetName] = useState("");
  const [retailCost, setRetailCost] = useState("");
  const [pulls, setPulls] = useState<PackPull[]>([]);
  const [loadingRip, setLoadingRip] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [chase, setChase] = useState<{ catalogId: string | number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { allowed, loading: accessLoading } = usePriceCheckAccess();
  const { credits, isPro, refresh: refreshCredits } = useCredits();
  const summary = packSummary(pulls);
  const ordered = sortedPulls(pulls);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); if (!data.user) navigate("/auth"); });
  }, [navigate]);
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    if (!ripId) { setLoadingRip(false); return; }
    setLoadingRip(true);
    (async () => {
      const { data, error } = await supabase.from("pack_rips").select("*").eq("id", ripId).eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (error || !data) { toast({ title: "Pack could not be loaded", variant: "destructive" }); setLoadingRip(false); return; }
      setSetName(data.set_name); setRetailCost(data.retail_cost == null ? "" : String(data.retail_cost));
      const saved = Array.isArray(data.pulls) ? data.pulls as unknown as PackPull[] : [];
      const hydrated = await Promise.all(saved.map(async p => {
        const { data: signed } = await supabase.storage.from("card-images").createSignedUrl(p.imagePath, 3600);
        return { ...p, imagePreview: signed?.signedUrl };
      }));
      if (!cancelled) { setPulls(hydrated); setLoadingRip(false); }
    })();
    return () => { cancelled = true; };
  }, [user, ripId, toast]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !setName.trim()) { setChase([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("cards").select("card_set, ai_analysis").eq("user_id", user.id).eq("item_type", "sealed").order("created_at", { ascending: false }).limit(100);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const wanted = norm(setName.replace(/booster box|booster pack|elite trainer box|booster bundle/gi, ""));
      const matched = data?.find(row => {
        const a = row.ai_analysis as Record<string, unknown> | null;
        return a?.setMatched === true && [row.card_set, a.matchedSet, (a.identification as Record<string, unknown> | undefined)?.set_name].some(s => typeof s === "string" && norm(s.replace(/^(pokemon|magic|yugioh|lorcana)\s+/i, "")) === wanted);
      });
      const list = (matched?.ai_analysis as Record<string, unknown> | undefined)?.chase;
      if (!cancelled) setChase(Array.isArray(list) ? list : []);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, setName]);

  const persist = async (next: PackPull[], id = ripId) => {
    if (!user || !id) throw new Error("Save a pack first.");
    const { error } = await supabase.from("pack_rips").update({ set_name: setName.trim(), retail_cost: Number(retailCost) || null, pulls: storedPulls(next), ...packSummary(next) }).eq("id", id).eq("user_id", user.id);
    if (error) throw error;
  };
  const ensureRip = async () => {
    if (ripId) return ripId;
    if (!user || !setName.trim()) throw new Error("Enter the pack's set name first.");
    const { data, error } = await supabase.from("pack_rips").insert({ user_id: user.id, set_name: setName.trim(), retail_cost: Number(retailCost) || null, pulls: [], total_value: 0 }).select("id").single();
    if (error) throw error;
    setParams({ rip: data.id }, { replace: true });
    return data.id;
  };
  const handleScan = async (file: File) => {
    if (!user || !allowed || lock.current) return;
    lock.current = true; setScanning(true);
    try {
      const id = await ensureRip();
      const path = `${user.id}/${crypto.randomUUID()}-rip.${file.name.split(".").pop() || "jpg"}`;
      const { error: uploadError } = await supabase.storage.from("card-images").upload(path, file);
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.functions.invoke("price-check", { body: { imagePath: path, packRipId: id } });
      if (error || data?.error || !data?.priceCheckId) throw new Error(data?.error || error?.message || "Price check could not finish.");
      const p: PackPull = { priceCheckId: data.priceCheckId, cardName: data.selected?.name || data.identification?.best?.name || "Unmatched card", cardSet: data.selected?.set, selected: data.selected, imagePath: path, imagePreview: URL.createObjectURL(file), category: data.identification?.category, year: data.identification?.best?.year };
      const next = [...pulls, p];
      await persist(next, id); setPulls(next);
      toast({ title: chaseHit(p, chase) ? "Chase hit!" : `Pulled: ${p.cardName}`, description: p.selected ? usd(pullValue(p)) : "No price match yet" });
    } catch (e) { toast({ title: "Price check failed", description: message(e), variant: "destructive" }); }
    finally { lock.current = false; setScanning(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };
  const addPull = async (p: PackPull) => {
    if (!user) throw new Error("Please sign in.");
    if (p.cardId) return p;
    const { data: existing, error: lookupError } = await supabase.from("cards").select("id").eq("user_id", user.id).eq("image_url", p.imagePath).maybeSingle();
    if (lookupError) throw lookupError;
    const cardId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      const { error } = await supabase.from("cards").insert(priceOnlyCard(p, user.id, cardId));
      if (error) throw error;
    }
    return { ...p, cardId };
  };
  const addAll = async () => {
    if (lock.current) return; lock.current = true; setBusy("all");
    let next = [...pulls];
    try {
      for (let i = 0; i < next.length; i++) {
        if (!next[i].selected || next[i].cardId) continue;
        next[i] = await addPull(next[i]);
        await persist(next); setPulls([...next]);
      }
      toast({ title: "Hits added to your collection", description: "Free · price-only cards" });
    } catch (e) { toast({ title: "Could not add every hit", description: message(e), variant: "destructive" }); }
    finally { lock.current = false; setBusy(null); }
  };
  const fullAnalysis = async (p: PackPull) => {
    if (lock.current) return;
    if (!isPro && credits < 1) { setShowUpgrade(true); return; }
    lock.current = true; setBusy(p.priceCheckId);
    try {
      const saved = await addPull(p);
      let next = pulls.map(o => o.priceCheckId === p.priceCheckId ? saved : o);
      await persist(next); setPulls(next);
      const { data, error } = await supabase.functions.invoke("reanalyze-card", { body: { cardId: saved.cardId, priceOnlyUpgrade: true } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      next = next.map(o => o.priceCheckId === p.priceCheckId ? { ...o, fullAnalysis: true } : o);
      await persist(next); setPulls(next); refreshCredits();
      toast({ title: "Full analysis started", description: "View progress in your collection." });
    } catch (e) { toast({ title: "Analysis could not start", description: message(e), variant: "destructive" }); }
    finally { lock.current = false; setBusy(null); }
  };
  const remove = async (p: PackPull) => {
    if (lock.current) return; lock.current = true; setBusy(p.priceCheckId);
    try { const next = pulls.filter(o => o.priceCheckId !== p.priceCheckId); await persist(next); setPulls(next); }
    catch (e) { toast({ title: "Could not remove pull", description: message(e), variant: "destructive" }); }
    finally { lock.current = false; setBusy(null); }
  };
  const finish = async () => {
    setBusy("save");
    try { await persist(pulls); toast({ title: "Pack saved", description: usd(summary.total_value) }); navigate("/collection"); }
    catch (e) { toast({ title: "Save failed", description: message(e), variant: "destructive" }); }
    finally { setBusy(null); }
  };
  const pending = scanning || !!busy || loadingRip;
  return <div className="min-h-screen bg-background">
    <SEO title="Pack Rip | MyCollectAI" description="Free pack pull price checks and pack totals." path="/pack-rip" noIndex />
    <header className="border-b border-border">
      <div className="container max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to collection" onClick={() => navigate("/collection")}><ArrowLeft className="w-5 h-5" /></Button>
        <Package className="w-5 h-5 text-primary" /><h1 className="text-xl font-display font-bold">Pack Rip</h1>
        <div className="ml-auto"><ThemeToggle /></div>
        <div className="w-full grid grid-cols-2 gap-4 pt-3">
          <div><p className="text-xs text-muted-foreground">Pack total · {pulls.length} pulls</p><p className="text-2xl font-bold text-primary">{usd(summary.total_value)}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Biggest hit</p><p className="font-semibold truncate">{summary.best_pull_name || "—"}</p>{summary.best_pull_value != null && <p className="text-sm text-primary">{usd(summary.best_pull_value)}</p>}</div>
        </div>
        {pulls.length > 0 && <PriceChartingAttribution hideLink className="w-full pt-1" />}
      </div>
    </header>
    <main className="container max-w-5xl mx-auto px-4 py-8 space-y-6">
      <section className="grid sm:grid-cols-2 gap-4">
        <div><Label htmlFor="set">Set / Product</Label><Input id="set" placeholder="e.g. Surging Sparks" value={setName} onChange={e => setSetName(e.target.value)} disabled={pending} /></div>
        <div><Label htmlFor="retail">Retail cost (optional)</Label><Input id="retail" type="number" min="0" step="0.01" placeholder="$ paid" value={retailCost} onChange={e => setRetailCost(e.target.value)} disabled={pending} /></div>
      </section>
      {accessLoading || loadingRip ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : !allowed ? <p className="text-muted-foreground">Free Price Check isn't available on your account yet.</p> : <section>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f); }} />
        <Button onClick={() => fileInputRef.current?.click()} disabled={pending || !setName.trim()} className="w-full py-6 text-lg gradient-primary text-primary-foreground">
          {scanning ? <><Loader2 className="mr-2 w-5 h-5 animate-spin" />Checking pull…</> : <><Plus className="mr-2 w-5 h-5" />Scan next pull · free</>}
        </Button>
      </section>}
      {!!pulls.length && <section className="flex flex-wrap gap-3">
        <Button onClick={addAll} disabled={pending || !pulls.some(p => p.selected && !p.cardId)}><Plus className="mr-2 w-4 h-4" />Add all hits to collection</Button>
        <Button onClick={finish} disabled={pending || !setName.trim()} variant="outline"><Trophy className="mr-2 w-4 h-4" />Finish &amp; Save Pack</Button>
      </section>}
      {!!pulls.length && <section className="pt-6 border-t border-border">
        <h2 className="font-display font-bold text-lg mb-4">Your pulls</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
          {ordered.map(p => <article key={p.priceCheckId} className="relative flex-none w-44 rounded-lg border border-border bg-card p-3 snap-start">
            <Button variant="ghost" size="icon" aria-label={`Remove ${p.cardName}`} className="absolute right-1 top-1 h-7 w-7 bg-background" disabled={pending} onClick={() => remove(p)}><X className="w-4 h-4" /></Button>
            <Link to={`/price/${p.priceCheckId}?rip=${ripId}`} className="block" aria-label={`View price for ${p.cardName}`}>
              {p.imagePreview ? <img src={p.imagePreview} alt={p.cardName} className="w-full h-48 object-contain rounded mb-3" /> : <Package className="w-full h-48 text-muted-foreground" />}
              <p className="font-semibold text-sm line-clamp-2 min-h-10">{p.cardName}</p>
              <p className="text-xs text-muted-foreground truncate">{p.cardSet}</p>
              <p className="text-lg font-bold text-primary">{p.selected?.ladder?.ungraded != null ? usd(pullValue(p)) : "No price"}</p>
            </Link>
            {chaseHit(p, chase) && <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-1"><Sparkles className="w-3 h-3" />Chase hit</span>}
            {p.cardId && <p className="text-xs text-muted-foreground mt-1">In collection</p>}
            <Button variant="outline" size="sm" className="mt-3 w-full px-1 text-xs" disabled={pending || !p.selected || p.fullAnalysis} onClick={() => fullAnalysis(p)}>
              {busy === p.priceCheckId ? <Loader2 className="w-4 h-4 animate-spin" /> : p.fullAnalysis ? "Analysis requested" : `Full analysis · ${isPro ? "Free with Pro" : "1 credit"}`}
            </Button>
          </article>)}
        </div>
      </section>}
    </main>
    <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} feature="Full analysis" /><Footer />
  </div>;
};
export default PackRip;
