import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Phone, Mail, MessageSquare, CalendarCheck, Flame, Clock, ShieldAlert, Check, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEAD_STAGES } from "@/lib/adminSections";
import { CALL_OUTCOMES, goalProgress, startOfDay, startOfMonth, startOfWeek, voicemailSeconds, type CallOutcome } from "@/lib/salesReps";
import { callScript, voicemailScript } from "@/components/reps/repScripts";

type Rep = Database["public"]["Tables"]["sales_reps"]["Row"];
type Lead = Database["public"]["Tables"]["agent_leads"]["Row"];
type Outreach = Database["public"]["Tables"]["agent_outreach"]["Row"];
type Stats = { touches: number; emails: number; calls: number; dms: number; replies: number; meetings: number; partners: number; signups: number; goal: number };
const nice = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const leadName = (l?: Lead | null) => l?.business_name || l?.name || l?.email || "Lead";
const first = (n?: string | null) => String(n ?? "").trim().split(/\s+/)[0] || null;

function CallCard({ task, lead, rep, onDone, onBook }: { task?: Outreach; lead: Lead; rep: Rep; onDone: () => void; onBook: (l: Lead) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const script = task?.draft_text?.trim() ? [task.draft_text] : callScript({ leadType: lead.lead_type, business: lead.business_name, first: first(lead.name), rep: first(rep.display_name) ?? rep.display_name });
  const vm = voicemailScript({ first: first(lead.name), rep: first(rep.display_name) ?? rep.display_name, phone: rep.phone });
  const log = async (o: CallOutcome) => {
    setBusy(o);
    const { error } = await supabase.rpc("rep_log_call", { _lead_id: lead.id, _outcome: o, _note: note || null, _task_id: task?.id ?? null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Logged"); setNote(""); onDone();
    if (o === "interested") onBook(lead);
  };
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="font-medium truncate">{leadName(lead)}</p>
            <p className="text-xs text-muted-foreground">{[lead.city, lead.state].filter(Boolean).join(", ")}{task ? " · sequence call" : ""}</p></div>
          {lead.phone ? <Button asChild size="sm" className="gradient-primary text-primary-foreground shrink-0"><a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}><Phone className="h-4 w-4 mr-1" />Call</a></Button>
            : <Badge variant="secondary">No phone</Badge>}
        </div>
        <button className="text-sm underline text-muted-foreground" onClick={() => setOpen(!open)}>{open ? "Hide script" : "Show script & voicemail"}</button>
        {open && <div className="text-sm space-y-2 rounded-lg bg-muted/50 p-3">
          {script.map((l, i) => <p key={i}>{l}</p>)}
          <p className="pt-2 font-medium">Voicemail (~{voicemailSeconds(vm)} s)</p><p>{vm}</p>
        </div>}
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          {CALL_OUTCOMES.map((o) => <Button key={o.id} variant={o.id === "do_not_contact" ? "destructive" : o.id === "interested" ? "default" : "outline"} size="sm" disabled={!!busy} onClick={() => log(o.id)}>
            {busy === o.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}{o.label}</Button>)}
        </div>
        <p className="text-[11px] text-muted-foreground">Dial from your own phone. No auto-dialers, recordings or AI voices.</p>
      </CardContent>
    </Card>
  );
}

function EmailCard({ o, lead, onDone }: { o: Outreach; lead?: Lead; onDone: () => void }) {
  const [text, setText] = useState(o.final_text ?? o.draft_text ?? "");
  const decide = async (status: "approved" | "rejected") => {
    const { error } = await supabase.from("agent_outreach").update({ status, final_text: text, decided_at: new Date().toISOString() }).eq("id", o.id);
    if (error) toast.error(error.message); else { toast.success(status === "approved" ? "Approved — it sends in the next send window" : "Skipped"); onDone(); }
  };
  return (
    <Card><CardContent className="p-4 space-y-2">
      <p className="font-medium truncate">{leadName(lead)} <span className="text-xs text-muted-foreground">· {o.subject}</span></p>
      {o.scheduled_for && <p className="text-xs text-muted-foreground">Sends {new Date(o.scheduled_for).toLocaleString()}</p>}
      {o.error && <p className="text-xs text-destructive">{o.error}</p>}
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" onClick={() => decide("approved")} disabled={!!o.error}><Check className="h-4 w-4 mr-1" />Approve</Button>
        <Button size="sm" variant="outline" onClick={() => decide("rejected")}><X className="h-4 w-4 mr-1" />Skip</Button></div>
    </CardContent></Card>
  );
}

function BookDialog({ lead, onClose, onDone }: { lead: Lead | null; onClose: () => void; onDone: () => void }) {
  const [at, setAt] = useState(""); const [conf, setConf] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setAt(""); setConf(""); setNote(""); }, [lead?.id]);
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("rep-actions", { body: { action: "book_meeting", lead_id: lead!.id,
      meeting_at: at ? new Date(at).toISOString() : undefined, confirmation: conf || undefined, note: note || undefined } });
    setBusy(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Couldn't book");
    toast.success(data?.drafts ? `Booked. ${data.drafts} email${data.drafts > 1 ? "s" : ""} drafted for your approval.` : `Booked. ${data?.note ?? ""}`);
    onDone(); onClose();
  };
  return (
    <Dialog open={!!lead} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Book a meeting with {leadName(lead)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Time</Label><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></div>
          <div><Label>…or paste the booking confirmation</Label><Textarea rows={3} value={conf} onChange={(e) => setConf(e.target.value)} /></div>
          <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">This stops their sequence and drafts a confirmation and a day-before reminder for you to approve.</p>
          <Button onClick={save} disabled={busy || (!at && !conf)} className="w-full gradient-primary text-primary-foreground">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Book meeting</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Board({ leads, onMove, onBook }: { leads: Lead[]; onMove: (id: string, stage: string) => void; onBook: (l: Lead) => void }) {
  const [type, setType] = useState("all"); const [q, setQ] = useState(""); const [drag, setDrag] = useState<string | null>(null);
  const shown = leads.filter((l) => (type === "all" || l.lead_type === type) && (!q || leadName(l).toLowerCase().includes(q.toLowerCase()) || (l.city ?? "").toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Input className="max-w-xs" placeholder="Search name or city" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          {["all", "card_shop", "seller", "creator", "collector", "other"].map((t) => <option key={t} value={t}>{t === "all" ? "All types" : nice(t)}</option>)}
        </select>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
        {LEAD_STAGES.map((st) => {
          const col = shown.filter((l) => l.stage === st);
          return (
            <div key={st} className="w-64 shrink-0 snap-start rounded-xl bg-muted/40 p-2" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) onMove(drag, st); setDrag(null); }}>
              <p className="text-xs font-semibold px-1 pb-2">{nice(st)} <span className="text-muted-foreground">{col.length}</span></p>
              <div className="space-y-2 min-h-12">
                {col.map((l) => (
                  <div key={l.id} draggable onDragStart={() => setDrag(l.id)} className="rounded-lg border border-border bg-card p-2 text-sm cursor-grab">
                    <p className="font-medium truncate">{leadName(l)}</p>
                    <p className="text-xs text-muted-foreground truncate">{[l.city, l.state].filter(Boolean).join(", ")}{l.fit_score != null ? ` · fit ${l.fit_score}` : ""}</p>
                    <div className="flex gap-1 mt-2">
                      <select aria-label="Move to stage" className="h-7 flex-1 rounded border border-input bg-background text-xs" value={l.stage} onChange={(e) => onMove(l.id, e.target.value)}>
                        {LEAD_STAGES.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
                      </select>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onBook(l)} aria-label="Book meeting"><CalendarCheck className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatGrid({ s }: { s?: Stats }) {
  if (!s) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const items: [string, number][] = [["Touches", s.touches], ["Replies", s.replies], ["Meetings", s.meetings], ["Partners activated", s.partners], ["Sign-ups", s.signups]];
  return <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{items.map(([k, v]) => <div key={k} className="rounded-lg border border-border p-3"><p className="text-2xl font-semibold">{v}</p><p className="text-xs text-muted-foreground">{k}</p></div>)}</div>;
}

function Profile({ rep, onSaved }: { rep: Rep; onSaved: () => void }) {
  const [f, setF] = useState({ name: rep.display_name, sig: rep.email_signature ?? "", phone: rep.phone ?? "", booking: rep.booking_link ?? "" });
  const save = async () => {
    const { error } = await supabase.rpc("rep_update_profile", { _display_name: f.name, _signature: f.sig, _phone: f.phone, _booking_link: f.booking });
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  };
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div><Label>Name on emails</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><Label>Email signature</Label><Textarea rows={3} value={f.sig} onChange={(e) => setF({ ...f, sig: e.target.value })} placeholder={"Jamie Lee\nMyCollectAI · 410-555-0100"} /></div>
      <div><Label>Phone (used in voicemails)</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div><Label>Booking link</Label><Input value={f.booking} onChange={(e) => setF({ ...f, booking: e.target.value })} placeholder="https://calendar.app.google/…" /></div>
      <p className="text-xs text-muted-foreground">Replies to your leads' emails come to your account email ({rep.email}). Your sign-up link: {window.location.origin}/price-check?ref={rep.ref_code} · Territories: {rep.territories.join(", ") || "none yet"}</p>
      <Button onClick={save}>Save</Button>
    </CardContent></Card>
  );
}

export default function Reps() {
  const navigate = useNavigate();
  const [rep, setRep] = useState<Rep | null | undefined>(undefined);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [stats, setStats] = useState<{ today?: Stats; week?: Stats; month?: Stats }>({});
  const [book, setBook] = useState<Lead | null>(null);
  const [replyFor, setReplyFor] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState("");

  const loadRep = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate(`/auth?next=${encodeURIComponent("/reps")}`); return; }
    await supabase.rpc("accept_rep_invite");
    const { data } = await supabase.from("sales_reps").select("*").eq("user_id", user.id).eq("active", true).maybeSingle();
    setRep(data ?? null);
  }, [navigate]);

  const load = useCallback(async () => {
    if (!rep) return;
    const [l, o, t, w, m] = await Promise.all([
      supabase.from("agent_leads").select("*").is("merged_into", null).order("created_at", { ascending: false }).limit(1000),
      supabase.from("agent_outreach").select("*").in("status", ["pending"]).order("created_at").limit(300),
      supabase.rpc("rep_stats", { _rep: rep.user_id, _since: startOfDay().toISOString() }),
      supabase.rpc("rep_stats", { _rep: rep.user_id, _since: startOfWeek().toISOString() }),
      supabase.rpc("rep_stats", { _rep: rep.user_id, _since: startOfMonth().toISOString() }),
    ]);
    setLeads(l.data ?? []); setOutreach(o.data ?? []);
    setStats({ today: t.data as unknown as Stats, week: w.data as unknown as Stats, month: m.data as unknown as Stats });
  }, [rep]);
  useEffect(() => { loadRep(); }, [loadRep]);
  useEffect(() => { load(); }, [load]);

  const mine = useMemo(() => leads.filter((l) => l.owner_id === rep?.user_id), [leads, rep]);
  const claimable = useMemo(() => leads.filter((l) => !l.owner_id), [leads]);
  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const now = Date.now();
  const closed = new Set(["not_interested", "do_not_contact", "signed_up", "active_partner"]);
  const emails = outreach.filter((o) => o.channel === "email" && o.lead_id && byId.get(o.lead_id)?.owner_id === rep?.user_id);
  const calls = outreach.filter((o) => o.channel === "call_task" && o.lead_id && byId.has(o.lead_id));
  const dms = outreach.filter((o) => o.channel === "dm_task" && o.lead_id && byId.has(o.lead_id));
  const hot = mine.filter((l) => l.stage === "replied" || ["interested", "question"].includes(l.reply_intent ?? ""));
  const followUps = mine.filter((l) => l.next_action_at && Date.parse(l.next_action_at) <= now && !closed.has(l.stage) && !hot.includes(l));

  const move = async (id: string, stage: string) => {
    if (stage === "meeting_booked") { const l = byId.get(id); if (l) setBook(l); return; }
    const { error } = await supabase.rpc("rep_set_stage", { _lead_id: id, _stage: stage });
    if (error) toast.error(error.message); else load();
  };
  const claim = async (id: string) => { const { data, error } = await supabase.rpc("rep_claim_lead", { _lead_id: id }); if (error || !data) toast.error(error?.message ?? "Someone else got it"); else { toast.success("It's yours"); load(); } };
  const dmDone = async (o: Outreach) => {
    const { error } = await supabase.rpc("rep_log_touch", { _lead_id: o.lead_id!, _kind: "dm", _note: o.subject ?? "DM sent" });
    if (!error) await supabase.from("agent_outreach").update({ status: "done", decided_at: new Date().toISOString() }).eq("id", o.id);
    if (error) toast.error(error.message); else load();
  };
  const saveReply = async () => {
    const { error } = await supabase.rpc("rep_log_reply", { _lead_id: replyFor!.id, _body: replyText, _intent: "other" });
    if (error) toast.error(error.message); else { toast.success("Reply recorded — their sequence stopped"); setReplyFor(null); setReplyText(""); load(); }
  };

  if (rep === undefined) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (rep === null) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldAlert className="h-10 w-10 text-destructive" /><h1 className="text-2xl font-semibold">This page is for sales reps</h1>
      <p className="text-muted-foreground max-w-sm">Ask your manager to invite the email you signed in with.</p>
      <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to app</Button>
    </div>
  );

  const t = stats.today;
  const done = t?.touches ?? 0;
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Rep workspace" description="MyCollectAI sales rep workspace" path="/reps" noIndex />
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur px-4 h-14 flex items-center gap-2">
        <h1 className="font-semibold flex-1 truncate">Hi {first(rep.display_name)}</h1>
        <Button variant="ghost" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" />App</Link></Button>
      </header>
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <Card><CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="font-medium">Touches today</span><span>{done} / {rep.daily_touch_goal}</span></div>
          <Progress value={goalProgress(done, rep.daily_touch_goal)} />
          <p className="text-xs text-muted-foreground">{t?.emails ?? 0} emails · {t?.calls ?? 0} calls · {t?.dms ?? 0} DMs</p>
        </CardContent></Card>

        <Tabs defaultValue="today">
          <TabsList className="w-full grid grid-cols-4"><TabsTrigger value="today">Today</TabsTrigger><TabsTrigger value="leads">My leads</TabsTrigger><TabsTrigger value="results">Results</TabsTrigger><TabsTrigger value="me">Me</TabsTrigger></TabsList>

          <TabsContent value="today" className="space-y-5 pt-2">
            {hot.length > 0 && <section className="space-y-2"><h2 className="font-semibold flex items-center gap-2"><Flame className="h-4 w-4 text-destructive" />Hot leads</h2>
              {hot.map((l) => <Card key={l.id}><CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><p className="font-medium truncate">{leadName(l)}</p><p className="text-xs text-muted-foreground truncate">{l.reply_summary ?? nice(l.stage)}</p></div>
                <div className="flex gap-2">{l.phone && <Button size="sm" variant="outline" asChild><a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`}><Phone className="h-4 w-4" /></a></Button>}
                  <Button size="sm" onClick={() => setBook(l)}><CalendarCheck className="h-4 w-4 mr-1" />Book</Button></div>
              </CardContent></Card>)}</section>}

            <section className="space-y-2"><h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" />Emails to approve ({emails.length})</h2>
              {emails.length === 0 ? <p className="text-sm text-muted-foreground">All caught up.</p> : emails.map((o) => <EmailCard key={o.id} o={o} lead={byId.get(o.lead_id!)} onDone={load} />)}</section>

            <section className="space-y-2"><h2 className="font-semibold flex items-center gap-2"><Phone className="h-4 w-4" />Calls ({calls.length})</h2>
              {calls.length === 0 ? <p className="text-sm text-muted-foreground">No call tasks due.</p> : <div className="grid gap-3 md:grid-cols-2">{calls.map((o) => <CallCard key={o.id} task={o} lead={byId.get(o.lead_id!)!} rep={rep} onDone={load} onBook={setBook} />)}</div>}</section>

            {dms.length > 0 && <section className="space-y-2"><h2 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" />DMs ({dms.length})</h2>
              {dms.map((o) => <Card key={o.id}><CardContent className="p-3 space-y-2"><p className="font-medium">{leadName(byId.get(o.lead_id!))}</p><p className="text-sm whitespace-pre-wrap text-muted-foreground">{o.draft_text}</p>
                <Button size="sm" onClick={() => dmDone(o)}>I sent it</Button></CardContent></Card>)}</section>}

            <section className="space-y-2"><h2 className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4" />Follow-ups due ({followUps.length})</h2>
              {followUps.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due.</p> : <div className="grid gap-3 md:grid-cols-2">{followUps.map((l) => (
                <div key={l.id} className="space-y-1"><p className="text-xs text-muted-foreground">{l.next_action}</p><CallCard lead={l} rep={rep} onDone={load} onBook={setBook} />
                  <Button size="sm" variant="ghost" onClick={() => setReplyFor(l)}>They replied to me directly…</Button></div>))}</div>}</section>

            {claimable.length > 0 && <section className="space-y-2"><h2 className="font-semibold">Unassigned in your area ({claimable.length})</h2>
              {claimable.slice(0, 30).map((l) => <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0"><p className="font-medium truncate">{leadName(l)}</p><p className="text-xs text-muted-foreground">{[l.city, l.state].filter(Boolean).join(", ")}</p></div>
                <Button size="sm" variant="outline" onClick={() => claim(l.id)}>Claim</Button></div>)}</section>}
          </TabsContent>

          <TabsContent value="leads" className="pt-2"><Board leads={mine} onMove={move} onBook={setBook} /></TabsContent>

          <TabsContent value="results" className="space-y-4 pt-2">
            <Card><CardHeader><CardTitle className="text-base">This week</CardTitle></CardHeader><CardContent><StatGrid s={stats.week} /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">This month</CardTitle></CardHeader><CardContent><StatGrid s={stats.month} /></CardContent></Card>
          </TabsContent>

          <TabsContent value="me" className="pt-2"><Profile rep={rep} onSaved={loadRep} /></TabsContent>
        </Tabs>
      </main>
      <BookDialog lead={book} onClose={() => setBook(null)} onDone={load} />
      <Dialog open={!!replyFor} onOpenChange={(v) => !v && setReplyFor(null)}>
        <DialogContent><DialogHeader><DialogTitle>Record a reply from {leadName(replyFor)}</DialogTitle></DialogHeader>
          <Textarea rows={5} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Paste what they wrote" />
          <Button onClick={saveReply} disabled={!replyText.trim()}>Save reply</Button></DialogContent>
      </Dialog>
    </div>
  );
}
