import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Camera, ExternalLink, Loader2, Tag } from "lucide-react";
import SEO from "@/components/SEO";
import { cn } from "@/lib/utils";

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
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("price_checks").select("candidates").eq("id", priceCheckId!).maybeSingle();
      setCandidates(((data?.candidates as unknown) as Candidate[]) ?? []);
      setLoading(false);
    })();
  }, [priceCheckId]);

  const c = candidates[pick];
  const rows = c ? LADDER_LABELS.filter(([k]) => c.ladder?.[k] != null) : [];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Price Check | MyCollectAI" description="PriceCharting value for your card." path="/price" noIndex />
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3 max-w-3xl">
          <Link to="/scan?mode=price"><Button variant="ghost" size="icon" aria-label="Back to scan"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <h1 className="text-xl font-display font-bold">Price check</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
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
                  <button key={o.productId} type="button" onClick={() => setPick(i)}
                    className={cn("w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm",
                      i === pick ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                    <span className="min-w-0"><span className="block font-medium text-foreground truncate">{o.name}</span><span className="block text-xs text-muted-foreground truncate">{o.set}</span></span>
                    {o.ladder?.ungraded != null && <span className="font-numeric text-foreground">{usd(o.ladder.ungraded)}</span>}
                  </button>
                ))}
              </section>
            )}
          </>
        )}
        <Link to="/scan?mode=price" className="block">
          <Button className="w-full py-6 text-lg gradient-primary"><Camera className="mr-2 w-5 h-5" /> Check another card</Button>
        </Link>
        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><Tag className="w-3 h-3" /> Free, no credits used.</p>
      </main>
    </div>
  );
};

export default PriceResult;
