import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inboxPauseReason, rate } from "@/lib/deliverability";

interface Dom { domain: string; role: "main" | "cold"; spf: string | null; dmarc: string | null; dkimSelectors: string[]; mx: boolean; coldProblem: string | null;
  inboxes: { email: string }[]; advice: { spf: string; dkim: string; dmarc: string; fixes: string[] } }
interface Inbox { id: string; email: string; domain: string; active: boolean; paused_reason: string | null; sends: number; bounces: number; complaints: number; replies: number }
interface Status { broadcasts_paused_at: string | null; broadcasts_paused_reason: string | null; sendgrid_30d: { delivered: number; spam: number; bounces: number; unsubscribes: number } }

const Mark = ({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) => (
  <span className="inline-flex items-center gap-1 text-xs mr-3">
    {ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : warn ? <AlertTriangle className="h-4 w-4 text-muted-foreground" /> : <XCircle className="h-4 w-4 text-destructive" />}{label}
  </span>
);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const PROJECT = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export default function EmailHealthCard() {
  const [doms, setDoms] = useState<Dom[] | null>(null);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [st, setSt] = useState<Status | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setDoms(null);
    const [h, i, s, w] = await Promise.all([
      supabase.functions.invoke("email-health"), supabase.rpc("inbox_health"), supabase.rpc("deliverability_status"),
      supabase.from("agent_settings").select("config").eq("key", "weekly_summary").maybeSingle(),
    ]);
    setDoms(((h.data as { domains?: Dom[] })?.domains ?? []));
    setInboxes((i.data as unknown as Inbox[]) ?? []); setSt(s.data as unknown as Status);
    setTo(String((w.data?.config as { to?: string })?.to ?? ""));
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveTo = async () => {
    const { error } = await supabase.from("agent_settings").update({ config: { to: to.trim() } }).eq("key", "weekly_summary");
    if (error) toast.error(error.message); else toast.success("Saved");
  };
  const sendTest = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("weekly-summary", { body: { to: to.trim() } });
    setBusy(false);
    if (error) toast.error("Couldn't send the summary"); else toast.success(`Summary queued to ${(data as { to: string }).to}`);
  };
  const resume = async () => { await supabase.rpc("deliverability_resume_broadcasts"); toast.success("Broadcasts resumed"); load(); };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Email health</CardTitle>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Check again</Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Sending domains</h3>
          {!doms ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : doms.map((d) => (
            <div key={d.domain} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.domain}</span>
                <Badge variant="secondary">{d.role === "main" ? "Main site" : "Cold inboxes"}</Badge>
                {d.inboxes.length > 0 && <span className="text-xs text-muted-foreground">{d.inboxes.map((i) => i.email).join(", ")}</span>}
              </div>
              <div>
                <Mark ok={d.advice.spf === "ok"} label="SPF" /><Mark ok={d.advice.dkim === "ok"} label={`DKIM${d.dkimSelectors.length ? ` (${d.dkimSelectors.join(", ")})` : ""}`} />
                <Mark ok={d.advice.dmarc === "ok"} warn={d.advice.dmarc === "none_policy"} label="DMARC" /><Mark ok={d.mx} label="MX" />
              </div>
              {d.coldProblem && <p className="text-sm text-destructive">{d.coldProblem}</p>}
              {d.advice.fixes.length > 0 && <ul className="text-sm text-muted-foreground list-disc pl-5">{d.advice.fixes.map((f) => <li key={f}>{f}</li>)}</ul>}
              {d.advice.dkim !== "ok" && d.role === "main" && <p className="text-xs text-muted-foreground">DKIM is looked up on common selector names; if your provider uses a custom one it may show as missing here even when set.</p>}
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Cold inboxes · last 7 days</h3>
          <p className="text-xs text-muted-foreground">An inbox pauses itself when bounces go above 3% or any spam complaint comes in. The others keep sending.</p>
          {inboxes.length === 0 ? <p className="text-sm text-muted-foreground">No inboxes yet.</p> : (
            <Table><TableHeader><TableRow><TableHead>Inbox</TableHead><TableHead className="text-right">Sends</TableHead><TableHead className="text-right">Bounces</TableHead><TableHead className="text-right">Complaints</TableHead><TableHead className="text-right">Replies</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{inboxes.map((i) => {
                const risk = inboxPauseReason(i);
                return (<TableRow key={i.id}><TableCell>{i.email}</TableCell><TableCell className="text-right">{i.sends}</TableCell>
                  <TableCell className="text-right">{i.bounces} <span className="text-muted-foreground">({pct(rate(i.bounces, i.sends))})</span></TableCell>
                  <TableCell className="text-right">{i.complaints}</TableCell><TableCell className="text-right">{i.replies} <span className="text-muted-foreground">({pct(rate(i.replies, i.sends))})</span></TableCell>
                  <TableCell className="text-sm">{i.active ? (risk ? <span className="text-destructive">At risk</span> : "Sending") : <span className="text-destructive">{i.paused_reason ?? "Paused"}</span>}</TableCell></TableRow>);
              })}</TableBody></Table>)}
          <p className="text-xs text-muted-foreground">Turn a paused inbox back on with its switch in the inbox list below once the cause is fixed.</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Opted-in lane (SendGrid) · last 30 days</h3>
          {st && <p className="text-sm">{st.sendgrid_30d.delivered} delivered · {st.sendgrid_30d.bounces} bounces · {st.sendgrid_30d.spam} spam reports · {st.sendgrid_30d.unsubscribes} unsubscribes</p>}
          {st?.broadcasts_paused_at && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>Broadcasts paused: {st.broadcasts_paused_reason}</span><Button size="sm" variant="outline" onClick={resume}>Resume broadcasts</Button>
            </div>)}
          <p className="text-xs text-muted-foreground">Broadcasts pause themselves when spam reports go above 0.1%. Events arrive once SendGrid's Event Webhook points at <code className="break-all">https://{PROJECT}.supabase.co/functions/v1/sendgrid-events</code> with signing turned on.</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Weekly summary · Mondays 8:00 ET</h3>
          <div className="flex flex-wrap gap-2">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" className="max-w-xs" />
            <Button variant="outline" onClick={saveTo}>Save</Button>
            <Button onClick={sendTest} disabled={busy || !to}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Send one now</Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
