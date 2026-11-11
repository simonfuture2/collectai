import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STAGES } from "@/lib/adminSections";
import { BULK_ENROLL_MAX, enrollSkipReason, spreadStarts, type SeqLane } from "@/lib/sequenceRules";

interface Seq { id: string; name: string; lane: string; lead_type: string | null }
const LEAD_TYPES = ["any", "card_shop", "seller", "collector", "creator", "other"];
const ANY = "any";

export default function BulkEnrollDialog({ open, onOpenChange, sequenceId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; sequenceId?: string; onDone?: () => void }) {
  const [seqs, setSeqs] = useState<Seq[]>([]);
  const [seqId, setSeqId] = useState(sequenceId ?? "");
  const [leadType, setLeadType] = useState(ANY);
  const [stage, setStage] = useState(ANY);
  const [state, setState] = useState("");
  const [preview, setPreview] = useState<{ ok: { id: string }[]; skipped: Record<string, number>; perDay: number; days: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("agent_sequences").select("id, name, lane, lead_type").eq("active", true).order("name").then(({ data }) => {
      setSeqs(data ?? []);
      const s = (data ?? []).find((x) => x.id === (sequenceId ?? seqId));
      if (s) { setSeqId(s.id); if (s.lead_type) setLeadType(s.lead_type); }
    });
    setPreview(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const seq = seqs.find((s) => s.id === seqId);

  const check = async () => {
    if (!seq) return toast.error("Pick a sequence");
    setBusy(true);
    let q = supabase.from("agent_leads").select("id, email, stage, do_not_contact, unsubscribed_at, consent_email, merged_into, user_id").is("merged_into", null);
    if (leadType !== ANY) q = q.eq("lead_type", leadType);
    if (stage !== ANY) q = q.eq("stage", stage);
    if (state.trim()) q = q.eq("state", state.trim().toUpperCase());
    const [{ data: leads, error }, { data: sup }, { data: act }, cap] = await Promise.all([
      q.limit(5000),
      supabase.from("email_suppressions").select("email"),
      supabase.from("agent_enrollments").select("lead_id").in("status", ["active", "paused"]).not("lead_id", "is", null),
      seq.lane === "cold" ? supabase.rpc("cold_capacity_today") : Promise.resolve({ data: null }),
    ]);
    setBusy(false);
    if (error) return toast.error(error.message);
    const ctx = { suppressed: new Set((sup ?? []).map((s) => s.email)), active: new Set((act ?? []).map((a) => a.lead_id as string)), lane: seq.lane as SeqLane };
    const ok: { id: string }[] = []; const skipped: Record<string, number> = {};
    for (const l of leads ?? []) {
      const why = enrollSkipReason(l, ctx);
      if (why) skipped[why] = (skipped[why] ?? 0) + 1; else ok.push(l);
    }
    if (ok.length > BULK_ENROLL_MAX) { skipped[`over the ${BULK_ENROLL_MAX} limit (run again later)`] = ok.length - BULK_ENROLL_MAX; ok.length = BULK_ENROLL_MAX; }
    const capData = cap.data as { capacity?: number; total?: number } | null;
    const perDay = seq.lane === "cold" ? Math.max(1, Number(capData?.capacity ?? capData?.total ?? 0) || 25) : 300;
    setPreview({ ok, skipped, perDay, days: Math.ceil(ok.length / perDay) });
  };

  const enroll = async () => {
    if (!seq || !preview?.ok.length) return;
    setBusy(true);
    const starts = spreadStarts(preview.ok.length, preview.perDay, new Date(), seq.lane as SeqLane);
    let done = 0, failed = 0;
    for (let i = 0; i < preview.ok.length; i++) {
      const { error } = await supabase.rpc("agent_start_enrollment", { p_sequence_id: seq.id, p_lead_id: preview.ok[i].id, p_start_at: starts[i].toISOString() });
      if (error) failed++; else done++;
    }
    setBusy(false);
    toast.success(`Enrolled ${done}${failed ? `, ${failed} failed` : ""}`);
    onOpenChange(false); onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Enroll leads in a sequence</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Sequence</Label>
            <Select value={seqId} onValueChange={(v) => { setSeqId(v); setPreview(null); }}>
              <SelectTrigger><SelectValue placeholder="Pick a sequence" /></SelectTrigger>
              <SelectContent>{seqs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.lane === "cold" ? "cold" : "opted in"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label>Lead type</Label>
              <Select value={leadType} onValueChange={(v) => { setLeadType(v); setPreview(null); }}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1"><Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => { setStage(v); setPreview(null); }}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>any</SelectItem>{LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1"><Label>State</Label><Input placeholder="e.g. MD" value={state} onChange={(e) => { setState(e.target.value); setPreview(null); }} /></div>
          </div>
          {preview && (
            <div className="rounded-lg border border-border p-3 text-sm space-y-1">
              <p><span className="font-semibold">{preview.ok.length}</span> will be enrolled, about {preview.perDay} a day over {preview.days || 0} {seq?.lane === "cold" ? "weekdays" : "days"}.</p>
              {Object.keys(preview.skipped).length > 0 && <div><p className="text-muted-foreground">Skipped:</p>
                <ul className="list-disc pl-5">{Object.entries(preview.skipped).map(([k, n]) => <li key={k}>{n} · {k}</li>)}</ul></div>}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy || !seqId} onClick={check}>{busy && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check leads"}</Button>
          <Button disabled={busy || !preview?.ok.length} onClick={enroll}>{busy && preview ? <Loader2 className="h-4 w-4 animate-spin" /> : `Enroll ${preview?.ok.length ?? 0}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
