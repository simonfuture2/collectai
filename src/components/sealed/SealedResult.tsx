import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ExternalLink, Loader2, Package, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DealChip, InsightPill } from "@/components/DealChip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ChaseCard = {
  rank: number; name: string; rawPrice: number | null; psa9?: number | null; psa10: number | null;
  thinMarket: boolean; soldUrl: string;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })}`;

const KIND_LABEL: Record<string, string> = {
  booster_pack: "Booster Pack", booster_box: "Booster Box", hobby_box: "Hobby Box", blaster_box: "Blaster Box",
  elite_trainer_box: "Elite Trainer Box", etb: "Elite Trainer Box", tin: "Tin", collection_box: "Collection Box",
  bundle: "Bundle", case: "Case",
};
export const kindLabel = (k?: string | null) =>
  !k ? "Sealed" : KIND_LABEL[k] || k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted/60", className)} />;
}

export function ChaseList({ chase, partial }: { chase: ChaseCard[]; partial?: boolean }) {
  return (
    <div>
      <ol className="divide-y divide-border/60">
        {chase.slice(0, 5).map((c) => (
          <li key={c.rank} className="flex items-start gap-3 py-3">
            <span className="font-numeric text-lg font-bold text-muted-foreground w-5 shrink-0 text-center">{c.rank}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug break-words">{c.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {c.psa10 != null && <span className="text-xs text-muted-foreground">PSA 10: {money(c.psa10)}</span>}
                {c.thinMarket && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Thin market</Badge>}
                <a href={c.soldUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-secondary hover:underline">
                  Sold listings <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <span className="font-numeric text-lg font-bold shrink-0">{money(c.rawPrice)}</span>
          </li>
        ))}
      </ol>
      {partial && (
        <p className="mt-2 text-xs text-muted-foreground">Based on the cards we could find for this set. Some high-end parallels may be missing.</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground border-t border-border/60 pt-3">
        Chase cards are rare. Most packs won't contain one, and these are single-card prices, not what a pack is worth.
      </p>
    </div>
  );
}

export default function SealedResult({
  card, imgUrl, isPending, statusLabel, onUpdated,
}: { card: any; imgUrl?: string; isPending: boolean; statusLabel?: string; onUpdated?: (c: any) => void }) {
  const a = card?.ai_analysis || {};
  const ident = a.identification || {};
  const isInsight = card?.scan_purpose === "insight";
  const chase: ChaseCard[] = Array.isArray(a.chase) ? a.chase : [];
  const candidates: string[] = Array.isArray(a.candidates) ? a.candidates : [];
  const [rematching, setRematching] = useState<string | null>(null);

  const rematch = async (consoleName: string) => {
    setRematching(consoleName);
    const { data, error } = await supabase.functions.invoke("sealed-rematch", { body: { cardId: card.id, consoleName } });
    setRematching(null);
    if (error || data?.error) { toast.error("Couldn't load that set"); return; }
    if (data?.card) onUpdated?.(data.card);
    toast.success("Chase list updated");
  };

  const productName = ident.printed_name || card?.card_name || "Sealed product";
  const setName = a.matchedSet || ident.set_name || card?.card_set;

  return (
    <div className="space-y-5">
      {/* Header */}
      <GlassCard padding="lg">
        <div className="flex gap-4">
          <div className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            {imgUrl ? <img src={imgUrl} alt={productName} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {isInsight && <InsightPill />}
              <Badge variant="secondary" className="gap-1"><Package className="w-3 h-3" />{kindLabel(ident.product_kind)}</Badge>
              {ident.language === "japanese" && <Badge variant="outline">Japanese</Badge>}
            </div>
            {isPending && !card?.card_name ? <Shimmer className="h-6 w-3/4" /> : (
              <h1 className="text-lg font-display font-bold leading-tight break-words">{productName}</h1>
            )}
            {setName && <p className="text-sm text-muted-foreground break-words">{setName}</p>}
            {isPending && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />{statusLabel || "Finding chase cards…"}</p>}
          </div>
        </div>
        {a.summary && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> AI summary</div>
            <p className="text-sm leading-relaxed">{a.summary}</p>
          </div>
        )}
      </GlassCard>

      {/* Sealed price */}
      <GlassCard padding="lg">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sealed market price</h2>
        {isPending ? <Shimmer className="h-10 w-1/2" /> : a.sealedPrice != null ? (
          <div className="space-y-2">
            <div className="font-numeric text-3xl font-bold">{money(a.sealedPrice)}</div>
            <p className="text-xs text-muted-foreground">
              PriceCharting{a.lastSyncedAt ? ` · updated ${formatDistanceToNow(new Date(a.lastSyncedAt), { addSuffix: true })}` : ""}
            </p>
            {card?.asking_price != null && (
              <div className="flex items-center gap-2 text-sm">
                <span>Asking {money(Number(card.asking_price))}</span>
                <DealChip asking={card.asking_price} low={card.estimated_value_low} high={card.estimated_value_high} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm">No sealed sales data yet</p>
            {a.ebaySoldUrl && <a href={a.ebaySoldUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-secondary inline-flex items-center gap-1 hover:underline">See sold listings <ExternalLink className="w-3 h-3" /></a>}
          </div>
        )}
      </GlassCard>

      {/* Chase */}
      <GlassCard padding="lg">
        <h2 className="text-base font-display font-bold">Top 5 chase cards</h2>
        <p className="text-xs text-muted-foreground mb-2">The most valuable cards you could pull from this set.</p>
        {isPending ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Shimmer key={i} className="h-10 w-full" />)}</div>
        ) : a.setMatched && chase.length ? (
          <ChaseList chase={chase} partial={a.partial} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm">We couldn't match this set's card list yet.</p>
            {candidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Did you mean…?</p>
                <div className="flex flex-col gap-2">
                  {candidates.map((c) => (
                    <Button key={c} variant="outline" size="sm" disabled={!!rematching} onClick={() => rematch(c)} className="justify-start h-auto py-2 whitespace-normal text-left">
                      {rematching === c && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}{c}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {!isPending && a.ebaySoldUrl && (
          <a href={a.ebaySoldUrl} target="_blank" rel="noopener noreferrer" className="mt-3 text-sm text-secondary inline-flex items-center gap-1 hover:underline">
            See sold listings for this product <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </GlassCard>

      {/* Tips */}
      <Collapsible>
        <GlassCard padding="md">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
            Buying sealed at a show <ChevronDown className="w-4 h-4" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Check the shrink wrap. Factory wrap is tight and even, with clean folds.</li>
              <li>Be careful with loose packs from an opened box. Packs can be searched or weighed for hits.</li>
              <li>Compare the asking price with the sealed market price above.</li>
            </ul>
          </CollapsibleContent>
        </GlassCard>
      </Collapsible>
    </div>
  );
}
