import PriceChartingAttribution from "@/components/PriceChartingAttribution";
import { useState } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/use-credits";
import { useToast } from "@/hooks/use-toast";
import { ladderRows, ungradedPrice, type Ladder } from "@/lib/priceLadder";

type Props = {
  card: { id: string; pricecharting_id?: number | null; pc_prices?: unknown; pc_synced_at?: string | null };
  onUpgraded: () => void;
};

const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;

export default function PriceOnlyPanel({ card, onUpgraded }: Props) {
  const ladder = (card.pc_prices as Ladder | null) ?? null;
  const raw = ungradedPrice(ladder);
  const rows = ladderRows(ladder).filter(r => r.key !== "ungraded");
  const { credits, isPro, refresh } = useCredits();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const upgrade = async () => {
    if (!isPro && credits < 1) { toast({ title: "You need 1 credit", description: "Get more credits to run a full analysis.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("reanalyze-card", { body: { cardId: card.id, priceOnlyUpgrade: true } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      refresh();
      toast({ title: "Full analysis started" });
      onUpgraded();
    } catch (e) {
      toast({ title: "Analysis could not start", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Badge className="bg-primary text-primary-foreground">Price only</Badge>
        <span className="text-xs text-muted-foreground">Grading, defects and advice unlock with a full analysis.</span>
      </div>
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
        <p className="font-display text-4xl font-bold">{raw != null ? usd(raw) : "No price"}</p>
        <p className="text-sm text-muted-foreground">Ungraded · PriceCharting</p>
      </div>
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {rows.map(r => (
            <div key={r.key} className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">{r.label}</p>
              <p className="font-semibold">{usd(r.value)}</p>
            </div>
          ))}
        </div>
      )}
      <PriceChartingAttribution productId={card.pricecharting_id} syncedAt={card.pc_synced_at} />
      <Button className="w-full gradient-primary text-primary-foreground" onClick={upgrade} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
        Get full analysis · {isPro ? "Free with Pro" : "1 credit"}
      </Button>
    </section>
  );
}
