import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Camera, ExternalLink, Loader2, Tag } from "lucide-react";
import SEO from "@/components/SEO";
import { cn } from "@/lib/utils";
import { packSummary, storedPulls, type PackPull } from "@/lib/packRip";

type Ladder = Record<string, number>;
type Candidate = { productId: number; name: string; set: string | null; number: string | null; ladder: Ladder; url: string };

const LADDER_LABELS: [string, string][] = [
  ["ungraded", "Ungraded"], ["grade7", "Grade 7"], ["grade8", "Grade 8"], ["grade9", "Grade 9"],
  ["grade9_5", "Grade 9.5"], ["psa10", "PSA 10"], ["bgs10", "BGS 10"], ["cgc10", "CGC 10"], ["sgc10", "SGC 10"],
  ["cgc10_pristine", "CGC 10 Pristine"], ["bgs10_black", "BGS 10 Black Label"], ["tag10", "TAG 10"], ["ace10", "ACE 10"],
  ["grade1", "Grade 1"], ["grade2", "Grade 2"], ["grade3", "Grade 3"], ["grade4", "Grade 4"], ["grade5", "Grade 5"], ["grade6", "Grade 6"],
];
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const PriceResult = () => {
  const { priceCheckId } = useParams();
  const [params] = useSearchParams();
  const ripId = params.get("rip");
  const backUrl = ripId ? `/pack-rip?rip=${ripId}` : "/scan?mode=price";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!priceCheckId) { setLoading(false); return; }
      const { data, error: readError } = await supabase.from("price_checks").select("candidates, selected_product_id").eq("id", priceCheckId).maybeSingle();
      if (readError) setError(readError.message);
      const list = ((data?.candidates as unknown) as Candidate[]) ?? [];
      setCandidates(list);
      let selectedId = data?.selected_product_id;
      if (ripId) {
        const { data: rip } = await supabase.from("pack_rips").select("pulls").eq("id", ripId).maybeSingle();
        const pull = (rip?.pulls as unknown as PackPull[] | undefined)?.find(p => p.priceCheckId === priceCheckId);
        selectedId = pull?.selected?.productId ?? selectedId;
      }
      setPick(Math.max(0, list.findIndex(c => c.productId === selectedId)));
      setLoading(false);
    })();
  }, [priceCheckId, ripId]);

  const choose = async (index: number) => {
    const selected = candidates[index];
    if (!selected || saving) return;
    if (!ripId) { setPick(index); return; }
    setSaving(true); setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in.");
      const { data: rip, error: readError } = await supabase.from("pack_rips").select("pulls").eq("id", ripId).eq("user_id", user.id).single();
      if (readError) throw readError;
      const pulls = rip.pulls as unknown as PackPull[];
      const original = pulls.find(p => p.priceCheckId === priceCheckId);
      if (!original) throw new Error("This pull is no longer in the pack.");
      const next = pulls.map(p => p.priceCheckId === priceCheckId ? { ...p, selected, cardName: selected.name, cardSet: selected.set } : p);
      if (original.cardId && !original.fullAnalysis) {
        const { error: cardError } = await supabase.from("cards").update({ card_name: selected.name, card_set: selected.set, pricecharting_id: selected.productId, pc_prices: selected.ladder, estimated_value_low: selected.ladder.ungraded ?? null, estimated_value_high: selected.ladder.ungraded ?? null }).eq("id", original.cardId).eq("user_id", user.id).eq("analysis_depth", "price_only");
        if (cardError) throw cardError;
      }
      const { error: saveError } = await supabase.from("pack_rips").update({ pulls: storedPulls(next), ...packSummary(next) }).eq("id", ripId).eq("user_id", user.id);
      if (saveError) throw saveError;
      setPick(index);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the match."); }
    finally { setSaving(false); }
  };

  const c = candidates[pick];
  const rows = c ? LADDER_LABELS.filter(([k]) => c.ladder?.[k] != null) : [];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Price Check | MyCollectAI" description="PriceCharting value for your card." path="/price" noIndex />
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3 max-w-3xl">
          <Link to={backUrl}><Button variant="ghost" size="icon" aria-label={ripId ? "Back to pack" : "Back to scan"}><ArrowLeft className="w-5 h-5" /></Button></Link>
          <h1 className="text-xl font-display font-bold">Price check</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !c ? (
          <p className="text-center text-muted-foreground py-12">No price match found for this photo.</p>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div>
                <p className="text-lg font-semibold text-foreground">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.set}</p>
              </div>
              <dl className="divide-y divide-border">
                {rows.map(([k, label]) => (
                  <div key={k} className="flex justify-between py-2 text-sm">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-numeric font-semibold text-foreground">{usd(c.ladder[k])}</dd>
                  </div>
                ))}
                {!rows.length && <p className="py-2 text-sm text-muted-foreground">No prices listed yet.</p>}
              </dl>
              <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                View on PriceCharting <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </section>
            {candidates.length > 1 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Not the right card?</h2>
                {candidates.map((o, i) => (
                  <Button key={o.productId} type="button" variant="outline" disabled={saving} onClick={() => choose(i)}
                    className={cn("w-full h-auto flex items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm",
                      i === pick ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                    <span className="min-w-0"><span className="block font-medium text-foreground truncate">{o.name}</span><span className="block text-xs text-muted-foreground truncate">{o.set}</span></span>
                    {o.ladder?.ungraded != null && <span className="font-numeric text-foreground">{usd(o.ladder.ungraded)}</span>}
                  </Button>
                ))}
              </section>
            )}
          </>
        )}
        <Link to={backUrl} className="block">
          <Button className="w-full py-6 text-lg gradient-primary"><Camera className="mr-2 w-5 h-5" /> {ripId ? "Back to pack" : "Check another card"}</Button>
        </Link>
        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><Tag className="w-3 h-3" /> Free, no credits used.</p>
      </main>
    </div>
  );
};

export default PriceResult;
