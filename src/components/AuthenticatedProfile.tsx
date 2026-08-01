import { useRef, useState } from "react";
import { Shield, BadgeCheck, Copy, ExternalLink, Loader2, Plus, Camera, Sparkles } from "lucide-react";
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
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const verifiedFromPhoto = card.authentication_data?.source === "slab_scan";
  const hasSlab = !!card.grading_company && (!!card.grading_cert_number || verifiedFromPhoto || !!card.is_authenticated);
  const hasAuthentiSeal = !!card.authentiseal_serial;

  // Persisted cert verification — only trusted when it matches the cert on file.
  const authData = card.authentication_data || {};
  const storedVerifiedAt: string | null = authData.cert_verified_at ?? null;
  const certMatches =
    !!storedVerifiedAt &&
    String(authData.cert_verified_number ?? "") === String(card.grading_cert_number ?? "") &&
    String(authData.cert_verified_company ?? "").toLowerCase() ===
      String(card.grading_company ?? "").toLowerCase();
  const [localVerifiedAt, setLocalVerifiedAt] = useState<string | null>(null);
  const alreadyVerified = certMatches || !!localVerifiedAt;
  const verifiedAt = localVerifiedAt ?? (certMatches ? storedVerifiedAt : null);
  const storedVerifyUrl: string | null = certMatches ? (authData.cert_verify_url ?? null) : null;
  const effectiveVerifyUrl = verifyUrl ?? storedVerifyUrl;


  async function handleSlabFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = "";
    setScanning(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error("You must be signed in.");
      const images: { label: string; url: string }[] = [];
      for (let i = 0; i < Math.min(files.length, 2); i++) {
        const f = files[i];
        const label = i === 0 ? "slab-front" : "slab-back";
        const filePath = `${userId}/${card.id}/slab-${Date.now()}-${i}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("card-images").upload(filePath, f);
        if (upErr) throw upErr;
        const { data: signed, error: urlErr } = await supabase.storage
          .from("card-images")
          .createSignedUrl(filePath, 3600);
        if (urlErr) throw urlErr;
        images.push({ label, url: signed.signedUrl });
      }
      const { data, error } = await supabase.functions.invoke("scan-slab", {
        body: { cardId: card.id, images },
      });
      if (error) throw error;
      if (data?.confirmedGrade) {
        toast({
          title: "Verified from slab photo",
          description: `${data.confirmedGrade.company} ${data.confirmedGrade.label ?? data.confirmedGrade.numeric} · refreshing market comps…`,
        });
      } else {
        toast({ title: "Slab scanned" });
      }
      onUpdated?.();
    } catch (err: any) {
      toast({
        title: "Slab scan failed",
        description: err?.message || "Try again with a clearer photo of the entire label.",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  }

  function openSlabPicker() {
    fileInputRef.current?.click();
  }

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={handleSlabFileChange}
    />
  );


  if (!hasSlab && !hasAuthentiSeal && !showAdd) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BadgeCheck className="w-5 h-5 text-amber-400" />
          <h3 className="font-display font-bold">Authenticated Profile</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Got this card graded? Scan a photo of the slab and we'll read the real grade off the label, refresh market comps for that grade, and score how close the AI pre-grade was.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={openSlabPicker} disabled={scanning} className="gradient-primary">
            {scanning ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Camera className="w-4 h-4 mr-1.5" />}
            Scan slab photo
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Enter cert manually
          </Button>
        </div>
        {hiddenInput}
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
        {verifiedFromPhoto && (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Verified from slab photo
          </span>
        )}
        {hasAuthentiSeal && !verifiedFromPhoto && (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
            AuthentiSeal
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={openSlabPicker} disabled={scanning} className="gradient-primary">
          {scanning ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Camera className="w-4 h-4 mr-1.5" />}
          {hasSlab ? "Re-scan slab photo" : "Scan slab photo"}
        </Button>
        {!hasSlab && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Enter cert manually
          </Button>
        )}
      </div>
      {hiddenInput}

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
              {card.grading_cert_number ? (
                <div className="flex items-center gap-1 mt-1">
                  <p className="font-mono text-sm font-medium">{card.grading_cert_number}</p>
                  <button onClick={() => copy(card.grading_cert_number!)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="font-mono text-sm text-muted-foreground mt-1">Not on file</p>
              )}
            </div>
          </div>

          {card.grading_cert_number && (
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
          )}

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
