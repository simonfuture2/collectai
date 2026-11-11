import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHANNEL_LABEL, STATUS_LABEL, setEnrollmentStatus } from "./sequenceClient";

interface Step { step_no: number; day_offset: number; channel: string; email_templates: { name: string } | null; angle: string | null }
interface Enr { id: string; status: string; current_step: number; next_due_at: string; started_at: string; stop_reason: string | null; clock_minutes: number | null;
  agent_sequences: { name: string; lane: string; agent_sequence_steps: Step[] } }

/** Start, pause or stop a sequence for one person, and see their upcoming steps. */
export default function SequencePanel({ leadId, userId }: { leadId?: string | null; userId?: string | null }) {
  const [rows, setRows] = useState<Enr[]>([]);
  const [seqs, setSeqs] = useState<{ id: string; name: string; lane: string }[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!leadId && !userId) return;
    let q = supabase.from("agent_enrollments").select("id, status, current_step, next_due_at, started_at, stop_reason, clock_minutes, agent_sequences(name, lane, agent_sequence_steps(step_no, day_offset, channel, angle, email_templates(name)))").order("started_at", { ascending: false });
    q = leadId ? q.eq("lead_id", leadId) : q.eq("user_id", userId!);
    const [{ data }, { data: s }] = await Promise.all([q, supabase.from("agent_sequences").select("id, name, lane").eq("active", true).order("name")]);
    setRows((data as unknown as Enr[]) ?? []); setSeqs(s ?? []);
  }, [leadId, userId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); load(); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const live = rows.find((r) => r.status === "active" || r.status === "paused");

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Sequence</h3>
      {live ? (
        <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{live.agent_sequences.name}</span>
            <Badge variant={live.status === "active" ? "default" : "secondary"}>{STATUS_LABEL[live.status]}</Badge>
          </div>
          <ol className="space-y-1">
            {[...live.agent_sequences.agent_sequence_steps].sort((a, b) => a.step_no - b.step_no).map((s) => {
              const done = s.step_no < live.current_step, cur = s.step_no === live.current_step;
              return <li key={s.step_no} className={`flex justify-between gap-2 ${done ? "text-muted-foreground line-through" : ""}`}>
                <span>Day {s.day_offset} · {CHANNEL_LABEL[s.channel]} · {s.email_templates?.name ?? s.angle?.split("\n")[0] ?? ""}</span>
                {cur && <span className="shrink-0 text-xs text-primary">{live.status === "active" ? `due ${new Date(live.next_due_at).toLocaleString()}` : "paused"}</span>}
              </li>;
            })}
          </ol>
          <div className="flex gap-2">
            {live.status === "active"
              ? <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => setEnrollmentStatus(live.id, "paused"), "Paused")}><Pause className="h-3.5 w-3.5 mr-1" />Pause</Button>
              : <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => setEnrollmentStatus(live.id, "active"), "Resumed")}><Play className="h-3.5 w-3.5 mr-1" />Resume</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => setEnrollmentStatus(live.id, "completed"), "Stopped")}><Square className="h-3.5 w-3.5 mr-1" />Stop</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Start a sequence…" /></SelectTrigger>
            <SelectContent>{seqs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.lane === "cold" ? "cold" : "opted in"}</SelectItem>)}</SelectContent>
          </Select>
          <Button disabled={busy || !pick} onClick={() => act(async () => {
            const { error } = await supabase.rpc("agent_start_enrollment", { p_sequence_id: pick, p_lead_id: leadId ?? undefined, p_user_id: leadId ? undefined : userId ?? undefined });
            if (error) throw error;
          }, "Sequence started")}>Start</Button>
        </div>
      )}
      {rows.filter((r) => r !== live).slice(0, 5).map((r) => (
        <p key={r.id} className="text-xs text-muted-foreground">{r.agent_sequences.name} · {STATUS_LABEL[r.status]}{r.stop_reason ? ` (${r.stop_reason})` : ""} · started {new Date(r.started_at).toLocaleDateString()}</p>
      ))}
    </section>
  );
}
