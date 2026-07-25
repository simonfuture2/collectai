import { useState } from "react";
import { Shield, BadgeCheck, Copy, ExternalLink, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const GRADERS = ["PSA", "BGS", "CGC", "SGC", "TAG", "AuthentiSeal"] as const;
type Grader = typeof GRADERS[number];

interface CardRow {
  id: string;
  is_authenticated?: boolean | null;
  authentiseal_serial?: string | null;
  authentication_data?: any;
  authenticated_at?: string | null;
  grading_company?: string | null;
  grading_cert_number?: string | null;
  grade_numeric?: number | null;
  condition_grade?: string | null;
  card_name?: string | null;
}

interface Props {
  card: CardRow;
  onUpdated?: () => void;
}

export default function AuthenticatedProfile({ card, onUpdated }: Props) {
  const { toast } = useToast();
  const [verifying, setVerifying] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [company, setCompany] = useState<Grader>("PSA");
  const [certNumber, setCertNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const hasSlab = !!card.grading_cert_number && !!card.grading_company;
  const hasAuthentiSeal = !!card.authentiseal_serial;

  if (!hasSlab && !hasAuthentiSeal && !showAdd) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BadgeCheck className="w-5 h-5 text-amber-400" />
          <h3 className="font-display font-bold">Authenticated Profile</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Got this card graded? Add the slab cert number to attach the official grade and enable verification.
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add slab cert
        </Button>
      </GlassCard>
    );
  }

  async function verifyCert() {
    if (!card.grading_company || !card.grading_cert_number) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-slab-cert", {
        body: { company: card.grading_company, cert_number: card.grading_cert_number },
      });
      if (error) throw error;
      setVerifyUrl(data?.verify_url ?? null);
      setReachable(!!data?.reachable);
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  }

  async function saveSlab() {
    if (!certNumber.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("cards")
        .update({
          grading_company: company,
          grading_cert_number: certNumber.trim(),
        })
        .eq("id", card.id);
      if (error) throw error;
      toast({ title: "Slab cert saved" });
      setShowAdd(false);
      onUpdated?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast({ title: "Copied" });
  };

  return (
    <GlassCard className="p-5 space-y-4 border-amber-500/30">
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-5 h-5 text-amber-400" />
        <h3 className="font-display font-bold">Authenticated Profile</h3>
        {hasAuthentiSeal && (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
            AuthentiSeal
          </span>
        )}
      </div>

      {/* Slab grade block */}
      {hasSlab ? (
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Official Grade</p>
              <p className="text-3xl font-display font-bold tabular-nums mt-1">
                {card.condition_grade ?? card.grade_numeric ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{card.grading_company}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cert #</p>
              <div className="flex items-center gap-1 mt-1">
                <p className="font-mono text-sm font-medium">{card.grading_cert_number}</p>
                <button onClick={() => copy(card.grading_cert_number!)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={verifyCert} disabled={verifying} className="gradient-primary">
              {verifying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Shield className="w-3.5 h-3.5 mr-1.5" />}
              Verify slab cert
            </Button>
            {verifyUrl && (
              <a href={verifyUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">
                  Open on {card.grading_company} <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </a>
            )}
          </div>

          {reachable === true && (
            <p className="text-xs text-emerald-400 mt-2">✓ Cert page resolved — click to inspect on {card.grading_company}.</p>
          )}
          {reachable === false && verifyUrl && (
            <p className="text-xs text-amber-400 mt-2">Couldn't auto-verify — open the link to check manually.</p>
          )}
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add slab cert
        </Button>
      )}

      {/* AuthentiSeal block */}
      {hasAuthentiSeal && (
        <div className="rounded-xl border border-border/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-semibold">AuthentiSeal Certificate</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-muted/40">
              <p className="text-muted-foreground">Serial</p>
              <p className="font-mono font-medium">{card.authentiseal_serial}</p>
            </div>
            {card.authenticated_at && (
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Issued</p>
                <p className="font-medium">{new Date(card.authenticated_at).toLocaleDateString()}</p>
              </div>
            )}
            {card.authentication_data?.issuer_name && (
              <div className="p-2 rounded-lg bg-muted/40 col-span-2">
                <p className="text-muted-foreground">Issuer</p>
                <p className="font-medium">{card.authentication_data.issuer_name}</p>
              </div>
            )}
          </div>
          <a
            href={`https://authentiseal.lovable.app/verify/${card.authentiseal_serial}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
          >
            View certificate on AuthentiSeal <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Add slab cert form */}
      {showAdd && (
        <div className="rounded-xl border border-border/60 p-4 space-y-3">
          <p className="text-sm font-semibold">Add slab cert</p>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select value={company} onValueChange={(v) => setCompany(v as Grader)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRADERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Cert number"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveSlab} disabled={saving || !certNumber.trim()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
