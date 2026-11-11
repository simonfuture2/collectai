import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUTO_APPROVE_AFTER, replyRates } from "@/lib/sequenceRules";
import BulkEnrollDialog from "./BulkEnrollDialog";
import { CHANNEL_LABEL, STATUS_LABEL } from "./sequenceClient";

type Seq = Database["public"]["Tables"]["agent_sequences"]["Row"];
type Step = Database["public"]["Tables"]["agent_sequence_steps"]["Row"];
type Tpl = { id: string; name: string; lane: string };
const NONE = "__ai__";

export default function SequencesSection() {
  const [seqs, setSeqs] = useState<Seq[] | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [enr, setEnr] = useState<{ sequence_id: string; status: string; current_step: number }[]>([]);
  const [sent, setSent] = useState<{ step_id: string | null }[]>([]);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [enrollFor, setEnrollFor] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Step>>>({});

  const load = useCallback(async () => {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from("agent_sequences").select("*").order("created_at"),
      supabase.from("agent_sequence_steps").select("*").order("step_no"),
      supabase.from("agent_enrollments").select("sequence_id, status, current_step").limit(10000),
      supabase.from("agent_outreach").select("step_id").not("step_id", "is", null).eq("status", "sent").limit(10000),
      supabase.from("email_templates").select("id, name, lane").order("name"),
    ]);
    setSeqs(a.data ?? []); setSteps(b.data ?? []); setEnr(c.data ?? []); setSent(d.data ?? []); setTpls(e.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const patchSeq = async (id: string, patch: Partial<Seq>) => {
    const { error } = await supabase.from("agent_sequences").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  const saveStep = async (s: Step) => {
    const p = edits[s.id]; if (!p) return;
    const { error } = await supabase.from("agent_sequence_steps").update(p).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Step saved"); setEdits((x) => { const n = { ...x }; delete n[s.id]; return n; }); load();
  };
  const addStep = async (seq: Seq) => {
    const own = steps.filter((s) => s.sequence_id === seq.id);
    const last = own[own.length - 1];
    const { error } = await supabase.from("agent_sequence_steps").insert({ sequence_id: seq.id, step_no: (last?.step_no ?? 0) + 1, day_offset: (last?.day_offset ?? 0) + 3, channel: "email", angle: "", require_approval: seq.lane === "cold" });
    if (error) return toast.error(error.message);
    load();
  };
  const delStep = async (s: Step) => {
    if (!confirm(`Remove step ${s.step_no}?`)) return;
    const { error } = await supabase.from("agent_sequence_steps").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  if (!seqs) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-2xl">Follow-ups stop by themselves on any real reply, unsubscribe, bounce, sign-up, or a stage change to meeting booked, not interested or do-not-contact. Cold steps send weekdays 8:30–17:00 in the lead's time, with at least 2 days between emails.</p>
        <Button onClick={() => setEnrollFor("")} className="gap-1"><UserPlus className="h-4 w-4" />Enroll leads</Button>
      </div>
      {seqs.map((seq) => {
        const own = steps.filter((s) => s.sequence_id === seq.id);
        const e = enr.filter((x) => x.sequence_id === seq.id);
        const counts: Record<string, number> = {};
        for (const x of e) counts[x.status] = (counts[x.status] ?? 0) + 1;
        const sentBy: Record<number, number> = {};
        for (const s of own) sentBy[s.step_no] = sent.filter((o) => o.step_id === s.id).length;
        const rates = replyRates(e, sentBy);
        const isOpen = open === seq.id;
        return (
          <Card key={seq.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <button className="flex items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : seq.id)}>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-semibold">{seq.name}</span>
                  <Badge variant={seq.lane === "cold" ? "secondary" : "outline"}>{seq.lane === "cold" ? "Cold" : "Opted in"}</Badge>
                  <span className="text-xs text-muted-foreground">{own.length} steps</span>
                </button>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2"><Switch checked={seq.active} onCheckedChange={(v) => patchSeq(seq.id, { active: v })} />On</label>
                  <Button size="sm" variant="outline" onClick={() => setEnrollFor(seq.id)}>Enroll</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.keys(STATUS_LABEL).map((k) => <Badge key={k} variant="outline" className="font-normal">{STATUS_LABEL[k]}: {counts[k] ?? 0}</Badge>)}
              </div>
              {isOpen && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={seq.auto_approve} onCheckedChange={(v) => patchSeq(seq.id, { auto_approve: v })} />
                    Auto-approve steps 2+ after {AUTO_APPROVE_AFTER} drafts approved without edits ({seq.approved_unedited} so far{seq.auto_approve && seq.approved_unedited >= AUTO_APPROVE_AFTER ? " · on" : ""})
                  </label>
                  {own.map((s) => {
                    const v = { ...s, ...edits[s.id] };
                    const set = (p: Partial<Step>) => setEdits((x) => ({ ...x, [s.id]: { ...x[s.id], ...p } }));
                    return (
                      <div key={s.id} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
                          <span className="font-medium">Step {s.step_no}</span>
                          <span className="text-xs text-muted-foreground">{sentBy[s.step_no] ?? 0} sent · {Math.round((rates[s.step_no] ?? 0) * 100)}% replied</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[90px_140px_1fr]">
                          <div className="space-y-1"><Label className="text-xs">Day</Label><Input type="number" min={0} value={v.day_offset} onChange={(e) => set({ day_offset: Number(e.target.value) })} /></div>
                          <div className="space-y-1"><Label className="text-xs">Type</Label>
                            <Select value={v.channel} onValueChange={(c) => set({ channel: c })}><SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{Object.entries(CHANNEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
                          </div>
                          {v.channel === "email" && <div className="space-y-1"><Label className="text-xs">Template</Label>
                            <Select value={v.template_id ?? NONE} onValueChange={(t) => set({ template_id: t === NONE ? null : t })}><SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value={NONE}>AI-written from the angle (n8n)</SelectItem>
                                {tpls.filter((t) => t.lane === seq.lane).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
                          </div>}
                        </div>
                        <div className="space-y-1"><Label className="text-xs">{v.channel === "email" ? "Angle (what this email is about)" : "Task / call script"}</Label>
                          <Textarea rows={v.channel === "email" ? 2 : 5} value={v.angle ?? ""} onChange={(e) => set({ angle: e.target.value })} /></div>
                        <div className="flex items-center gap-4 flex-wrap text-sm">
                          <label className="flex items-center gap-2"><Switch checked={v.require_approval} onCheckedChange={(x) => set({ require_approval: x })} />Needs approval</label>
                          <label className="flex items-center gap-2"><Switch checked={v.include_link} onCheckedChange={(x) => set({ include_link: x })} />Link</label>
                          <label className="flex items-center gap-2"><Switch checked={v.include_video} onCheckedChange={(x) => set({ include_video: x })} />Video</label>
                          <div className="flex-1" />
                          <Button size="sm" variant="ghost" onClick={() => delStep(s)}><Trash2 className="h-4 w-4" /></Button>
                          <Button size="sm" disabled={!edits[s.id]} onClick={() => saveStep(s)}>Save</Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => addStep(seq)}><Plus className="h-4 w-4" />Add step</Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <BulkEnrollDialog open={enrollFor !== null} onOpenChange={(o) => !o && setEnrollFor(null)} sequenceId={enrollFor || undefined} onDone={load} />
    </div>
  );
}
