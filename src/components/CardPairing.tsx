import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Link2, ArrowUpRight, Loader2, Unlink, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CardShape {
  id: string;
  is_authenticated?: boolean | null;
  grading_cert_number?: string | null;
  authentiseal_serial?: string | null;
  paired_raw_card_id?: string | null;
  superseded_by_card_id?: string | null;
  card_name?: string | null;
}

interface Candidate {
  id: string;
  card_name: string | null;
  card_set: string | null;
  card_year: string | null;
  edition: string | null;
  image_url: string;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  created_at: string;
  confidence: number;
}

interface RawSnapshot {
  id: string;
  card_name: string | null;
  card_set: string | null;
  image_url: string;
  condition_grade: string | null;
  estimated_value_low: number | null;
  estimated_value_high: number | null;
  created_at: string;
}

interface GradedRef {
  id: string;
  card_name: string | null;
  condition_grade: string | null;
  grading_company: string | null;
}

interface Props {
  card: CardShape;
  onChanged?: () => void;
}

export default function CardPairing({ card, onChanged }: Props) {
  const { toast } = useToast();
  const isGraded = !!(card.is_authenticated || card.grading_cert_number || card.authentiseal_serial);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [pairing, setPairing] = useState<string | null>(null);
  const [rawSnapshot, setRawSnapshot] = useState<RawSnapshot | null>(null);
  const [gradedRef, setGradedRef] = useState<GradedRef | null>(null);

  // Load paired raw (when graded) or graded ref (when raw was superseded)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (card.paired_raw_card_id) {
        const { data } = await supabase.from("cards")
          .select("id, card_name, card_set, image_url, condition_grade, estimated_value_low, estimated_value_high, created_at")
          .eq("id", card.paired_raw_card_id).maybeSingle();
        if (!cancelled && data) {
          const signed = await resolveImg(data.image_url);
          setRawSnapshot({ ...data, image_url: signed });
        }
      } else {
        setRawSnapshot(null);
      }
      if (card.superseded_by_card_id) {
        const { data } = await supabase.from("cards")
          .select("id, card_name, condition_grade, grading_company")
          .eq("id", card.superseded_by_card_id).maybeSingle();
        if (!cancelled && data) setGradedRef(data);
      } else {
        setGradedRef(null);
      }
    })();
    return () => { cancelled = true; };
  }, [card.paired_raw_card_id, card.superseded_by_card_id]);

  // Suggest candidates when graded and unpaired
  useEffect(() => {
    if (!isGraded || card.paired_raw_card_id) { setCandidates([]); return; }
    let cancelled = false;
    setLoadingSuggest(true);
    supabase.functions.invoke("suggest-card-pair", { body: { graded_card_id: card.id } })
      .then(({ data }) => { if (!cancelled) setCandidates(data?.candidates ?? []); })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setLoadingSuggest(false); });
    return () => { cancelled = true; };
  }, [card.id, isGraded, card.paired_raw_card_id]);

  async function pairWith(rawId: string) {
    setPairing(rawId);
    try {
      const { error } = await supabase.functions.invoke("pair-cards", {
        body: { graded_card_id: card.id, raw_card_id: rawId },
      });
      if (error) throw error;
      toast({ title: "Cards paired", description: "The raw scan is now stored as pre-grade history." });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Pair failed", description: e.message, variant: "destructive" });
    } finally {
      setPairing(null);
    }
  }

  async function unpair() {
    setPairing("unpair");
    try {
      const { error } = await supabase.functions.invoke("pair-cards", {
        body: { graded_card_id: card.id, unpair: true },
      });
      if (error) throw error;
      toast({ title: "Unpaired" });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Unpair failed", description: e.message, variant: "destructive" });
    } finally {
      setPairing(null);
    }
  }

  // Raw card that was upgraded → link back to graded version
  if (gradedRef) {
    return (
      <GlassCard className="p-4 border-amber-500/30">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Upgraded to graded version</p>
            <p className="text-xs text-muted-foreground truncate">
              {gradedRef.grading_company ? `${gradedRef.grading_company} ` : ""}
              {gradedRef.condition_grade ?? "graded"} · {gradedRef.card_name}
            </p>
          </div>
          <Link to={`/card/${gradedRef.id}`}>
            <Button size="sm" variant="outline">Open <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></Button>
          </Link>
        </div>
      </GlassCard>
    );
  }

  if (!isGraded) return null;

  return (
    <div className="space-y-4">
      {/* Suggestion */}
      {!card.paired_raw_card_id && candidates.length > 0 && (
        <GlassCard className="p-4 border-amber-500/30">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold">Looks like a graded version of a card you already own</p>
          </div>
          <div className="space-y-2">
            {candidates.slice(0, 3).map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
                <div className="w-10 h-14 bg-muted rounded overflow-hidden shrink-0" />
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-medium truncate">{c.card_name}</p>
                  <p className="text-muted-foreground truncate">
                    {c.card_set} · {c.condition_grade ?? "raw"} · scanned {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" onClick={() => pairWith(c.id)} disabled={pairing === c.id}>
                  {pairing === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Pair"}
                </Button>
              </div>
            ))}
          </div>
          {loadingSuggest && <p className="text-xs text-muted-foreground mt-2">Looking for matches…</p>}
        </GlassCard>
      )}

      {/* Paired raw snapshot */}
      {rawSnapshot && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Before grading</p>
              <p className="text-sm font-semibold">Raw scan history</p>
            </div>
            <Button size="sm" variant="ghost" onClick={unpair} disabled={pairing === "unpair"}>
              {pairing === "unpair" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Unlink className="w-3.5 h-3.5 mr-1" /> Unpair</>}
            </Button>
          </div>
          <div className="flex gap-3">
            <img src={rawSnapshot.image_url} alt="" className="w-16 h-22 object-cover rounded" />
            <div className="text-xs space-y-0.5">
              <p><span className="text-muted-foreground">Scanned:</span> {new Date(rawSnapshot.created_at).toLocaleDateString()}</p>
              <p><span className="text-muted-foreground">AI grade:</span> {rawSnapshot.condition_grade ?? "—"}</p>
              <p><span className="text-muted-foreground">AI value:</span> ${Math.round(rawSnapshot.estimated_value_low ?? 0)} – ${Math.round(rawSnapshot.estimated_value_high ?? 0)}</p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

async function resolveImg(path: string): Promise<string> {
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("card-images").createSignedUrl(path, 3600);
  return data?.signedUrl ?? path;
}
