import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Inbox, Users, Radio, BarChart3, Plus, ExternalLink, Copy, X, Search, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SEO from "@/components/SEO";
import type { Database } from "@/integrations/supabase/types";

type Outreach = Database["public"]["Tables"]["agent_outreach"]["Row"];
type Lead = Database["public"]["Tables"]["agent_leads"]["Row"];
type Setting = Database["public"]["Tables"]["agent_settings"]["Row"];
type Funnel = Database["public"]["Views"]["agent_funnel"]["Row"];
type OutreachWithLead = Outreach & { agent_leads: Pick<Lead, "business_name" | "email" | "name"> | null };

const PLATFORMS = ["instagram", "tiktok", "reddit", "discord", "email", "other"];
const LEAD_TYPES = ["collector", "card_shop", "seller", "creator", "other"];
const LEAD_STATUSES = ["new", "drafting", "queued", "contacted", "replied", "signed_up", "not_interested", "do_not_contact"];
const CHANNEL_LABEL: Record<string, string> = {
  instagram_dm: "Instagram DM", reddit_reply: "Reddit", discord_reply: "Discord", email: "Email",
};
const WORKFLOW_LABEL: Record<string, string> = {
  ig_comment_dm: "Instagram comment → DM", community_drafts: "Community replies", email_outreach: "Email outreach",
};
const nice = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const ago = (d: string | null) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "never");
const now = () => new Date().toISOString();

type Tab = "queue" | "leads" | "channels" | "results";

export default function AgentHQ() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<"loading" | "ok" | "denied">("loading");
  const [tab, setTab] = useState<Tab>("queue");
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate(`/auth?next=${encodeURIComponent("/admin/agent")}`); return; }
      const { data } = await supabase.from("agent_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      setAccess(data ? "ok" : "denied");
    })();
  }, [navigate]);

  const loadCount = useCallback(async () => {
    const { count } = await supabase.from("agent_outreach").select("id", { count: "exact", head: true }).eq("status", "pending").neq("status", "drafting");
    setPendingCount(count ?? 0);
  }, []);

  useEffect(() => {
    if (access !== "ok") return;
    loadCount();
    const ch = supabase
      .channel("agent-outreach-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_outreach" }, (p) => {
        if (p.eventType === "INSERT") toast("New draft in queue");
        loadCount();
        setRefreshKey((k) => k + 1);
      })
      .subscribe();
    // Backup in case live updates aren't enabled for this table.
    const t = setInterval(() => { loadCount(); }, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [access, loadCount]);

  if (access === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (access === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="text-muted-foreground">This page is only for agent admins.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to app</Button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof Inbox; badge?: number }[] = [
    { id: "queue", label: "Queue", icon: Inbox, badge: pendingCount },
    { id: "leads", label: "Leads", icon: Users },
    { id: "channels", label: "Channels", icon: Radio },
    { id: "results", label: "Results", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <SEO title="Agent HQ" description="Agent control center" path="/admin/agent" noIndex />
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold">Agent HQ</h1>
          <nav className="hidden md:flex gap-1">
            {tabs.map((t) => (
              <Button key={t.id} variant={tab === t.id ? "default" : "ghost"} size="sm" onClick={() => setTab(t.id)} className="gap-2">
                <t.icon className="h-4 w-4" />{t.label}
                {!!t.badge && <Badge variant="secondary" className="ml-1">{t.badge}</Badge>}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {tab === "queue" && <QueueTab refreshKey={refreshKey} onChange={loadCount} />}
        {tab === "leads" && <LeadsTab />}
        {tab === "channels" && <ChannelsTab />}
        {tab === "results" && <ResultsTab />}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-xs ${tab === t.id ? "text-primary" : "text-muted-foreground"}`}>
              <t.icon className="h-5 w-5" />{t.label}
              {!!t.badge && <span className="absolute top-1 right-[28%] min-w-[18px] rounded-full bg-primary px-1 text-[10px] leading-[18px] text-primary-foreground">{t.badge}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chips({ value, options, onChange }: { value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <Button key={o.v} size="sm" variant={value === o.v ? "default" : "outline"} onClick={() => onChange(o.v)}>{o.l}</Button>
      ))}
    </div>
  );
}

/* ---------------- Queue ---------------- */

function QueueTab({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [items, setItems] = useState<OutreachWithLead[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("agent_outreach")
      .select("*, agent_leads(business_name,email,name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as OutreachWithLead[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const done = () => { load(); onChange(); };
  const shown = (items ?? []).filter((i) =>
    filter === "all" ? true : filter === "email" ? i.channel === "email" : i.channel === "reddit_reply");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Chips value={filter} onChange={setFilter} options={[{ v: "all", l: "All" }, { v: "reddit", l: "Reddit" }, { v: "email", l: "Email" }]} />
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1"><Plus className="h-4 w-4" />Add post manually</Button>
      </div>
      {items === null ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        : shown.length === 0 ? <Empty title="Queue's clear" hint="New drafts show up here as the agent finds them." />
        : shown.map((i) => <QueueCard key={i.id} item={i} onDone={done} />)}
      <AddPostDialog open={addOpen} onOpenChange={setAddOpen} onAdded={done} />
    </div>
  );
}

function QueueCard({ item, onDone }: { item: OutreachWithLead; onDone: () => void }) {
  const [text, setText] = useState(item.final_text || item.draft_text || "");
  const [subject, setSubject] = useState(item.subject || "");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const isEmail = item.channel === "email";
  const isManual = item.channel === "reddit_reply" || item.channel === "discord_reply";
  // Agent posts that haven't had their draft attached yet — show a drafting notice instead of the reply box.
  const isDrafting = !item.final_text && !item.draft_text && !isManual;

  const update = async (patch: Partial<Outreach>, msg?: string) => {
    setBusy(true);
    const { error } = await supabase.from("agent_outreach").update(patch).eq("id", item.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (msg) toast.success(msg);
    onDone();
  };

  const copyAndOpen = async () => {
    try { await navigator.clipboard.writeText(text); } catch { toast.error("Couldn't copy — select the text manually."); }
    if (item.source_url) window.open(item.source_url, "_blank", "noopener,noreferrer");
    update({ final_text: text, status: "posted_manually", decided_at: now() }, "Copied — paste it in the thread.");
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline">{CHANNEL_LABEL[item.channel] ?? item.channel}</Badge>
          <span className="text-xs text-muted-foreground" title={new Date(item.created_at).toLocaleString()}>{ago(item.created_at)}</span>
        </div>
        {isEmail && item.agent_leads && (
          <p className="text-sm"><span className="font-medium">{item.agent_leads.business_name || item.agent_leads.name}</span>
            {item.agent_leads.email && <span className="text-muted-foreground"> · {item.agent_leads.email}</span>}</p>
        )}
        {item.source_text && (
          <div className="text-sm text-muted-foreground">
            <p className={`whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}>{item.source_text}</p>
            {item.source_text.length > 180 && (
              <button className="text-primary text-xs mt-1" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show more"}</button>
            )}
          </div>
        )}
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary">
            Open post <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {isEmail && (
          <div className="space-y-1"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        )}
        {isDrafting ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Drafting a reply…
          </div>
        ) : (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Reply text" />
        )}
        <div className="flex gap-2 flex-wrap">
          {isEmail && (
            <Button disabled={busy || isDrafting || !text.trim()} onClick={() => update({ final_text: text, subject, status: "approved", decided_at: now() }, "Approved — sends within 10 minutes.")}>
              Approve & send
            </Button>
          )}
          {isManual && <Button disabled={busy || isDrafting || !text.trim()} onClick={copyAndOpen} className="gap-1"><Copy className="h-4 w-4" />Copy & open</Button>}
          <Button variant="outline" disabled={busy} onClick={() => update({ status: "rejected", decided_at: now() }, "Rejected")} className="gap-1">
            <X className="h-4 w-4" />Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddPostDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [ch, setCh] = useState<"reddit_reply" | "discord_reply">("reddit_reply");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!/^https?:\/\//i.test(url.trim())) { toast.error("Enter a valid post URL"); return; }
    setBusy(true);
    const { error } = await supabase.from("agent_outreach").insert({
      workflow: "community_drafts", channel: ch, external_ref: url.trim(), source_url: url.trim(),
      source_text: author.trim() ? `${author.trim()}: ${text}` : text, ref_code: ch, status: "pending", draft_text: "",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Post added to the queue");
    setUrl(""); setAuthor(""); setText(""); onOpenChange(false); onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add post manually</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Chips value={ch} onChange={(v) => setCh(v as typeof ch)} options={[{ v: "reddit_reply", l: "Reddit" }, { v: "discord_reply", l: "Discord" }]} />
          <div className="space-y-1"><Label>Post URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
          <div className="space-y-1"><Label>Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
          <div className="space-y-1"><Label>Post text</Label><Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} /></div>
        </div>
        <DialogFooter><Button disabled={busy} onClick={save}>Add to queue</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Leads ---------------- */

function FilterSelect({ value, onChange, options, all }: { value: string; onChange: (v: string) => void; options: string[]; all: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{nice(o)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function LeadsTab() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [open, setOpen] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("agent_leads").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) toast.error(error.message);
    setLeads(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (leads ?? []).filter((l) => {
    if (platform !== "all" && l.platform !== platform) return false;
    if (type !== "all" && l.lead_type !== type) return false;
    if (status !== "all" && l.status !== status) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [l.name, l.handle, l.email, l.business_name, l.website, l.notes].some((v) => v?.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1"><Plus className="h-4 w-4" />Add lead</Button>
      </div>
      <div className="grid grid-cols-1 sm:flex gap-2">
        <FilterSelect value={platform} onChange={setPlatform} options={PLATFORMS} all="All platforms" />
        <FilterSelect value={type} onChange={setType} options={LEAD_TYPES} all="All types" />
        <FilterSelect value={status} onChange={setStatus} options={LEAD_STATUSES} all="All statuses" />
      </div>
      {leads === null ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        : shown.length === 0 ? <Empty title="No leads yet" hint="Add a card shop or creator and the agent will draft an email." />
        : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {shown.map((l) => (
              <button key={l.id} onClick={() => setOpen(l)} className="w-full text-left p-3 hover:bg-muted/50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.business_name || l.name || l.handle || l.email || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">{nice(l.platform)} · {nice(l.lead_type)}{l.email ? ` · ${l.email}` : ""}</p>
                </div>
                <Badge variant={l.do_not_contact ? "destructive" : "secondary"} className="shrink-0">{nice(l.status)}</Badge>
              </button>
            ))}
          </div>
        )}
      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
      <LeadDrawer lead={open} onClose={() => setOpen(null)} onSaved={load} />
    </div>
  );
}

function LeadFields({ v, set }: { v: Partial<Lead>; set: (p: Partial<Lead>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label>Platform</Label>
          <Select value={v.platform ?? "email"} onValueChange={(x) => set({ platform: x })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{nice(p)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Type</Label>
          <Select value={v.lead_type ?? "card_shop"} onValueChange={(x) => set({ lead_type: x })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{LEAD_TYPES.map((p) => <SelectItem key={p} value={p}>{nice(p)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1"><Label>Name</Label><Input value={v.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="space-y-1"><Label>Business name</Label><Input value={v.business_name ?? ""} onChange={(e) => set({ business_name: e.target.value })} /></div>
      <div className="space-y-1"><Label>Email</Label><Input type="email" value={v.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></div>
      <div className="space-y-1"><Label>Website</Label><Input value={v.website ?? ""} onChange={(e) => set({ website: e.target.value })} /></div>
      <div className="space-y-1"><Label>Notes</Label>
        <Textarea rows={5} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
        <p className="text-xs text-muted-foreground">Something specific about them. The agent writes the email from this.</p>
      </div>
    </div>
  );
}

const blank = (s?: string | null) => (s && s.trim() ? s.trim() : null);

function AddLeadDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [v, setV] = useState<Partial<Lead>>({ platform: "email", lead_type: "card_shop" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email.trim())) { toast.error("That email doesn't look right"); return; }
    setBusy(true);
    const { error } = await supabase.from("agent_leads").insert({
      platform: v.platform ?? "email", lead_type: v.lead_type ?? "card_shop", name: blank(v.name), business_name: blank(v.business_name),
      email: blank(v.email), website: blank(v.website), notes: blank(v.notes), status: "new",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Added — a draft appears in the Queue within 15 minutes.");
    setV({ platform: "email", lead_type: "card_shop" }); onOpenChange(false); onAdded();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader>
        <LeadFields v={v} set={(p) => setV((s) => ({ ...s, ...p }))} />
        <DialogFooter><Button disabled={busy} onClick={save}>Add lead</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadDrawer({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Partial<Lead>>({});
  const [history, setHistory] = useState<Outreach[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setV(lead);
    supabase.from("agent_outreach").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false })
      .then(({ data }) => setHistory(data ?? []));
  }, [lead]);

  const save = async (patch?: Partial<Lead>) => {
    if (!lead) return;
    const p = { ...v, ...patch };
    setBusy(true);
    const { error } = await supabase.from("agent_leads").update({
      platform: p.platform, lead_type: p.lead_type, name: blank(p.name), business_name: blank(p.business_name),
      email: blank(p.email), website: blank(p.website), notes: blank(p.notes), status: p.status, do_not_contact: p.do_not_contact,
    }).eq("id", lead.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setV(p);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>{v.business_name || v.name || v.handle || "Lead"}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-destructive/40 p-3">
            <div><p className="font-medium text-destructive">Do not contact</p><p className="text-xs text-muted-foreground">The agent will never reach out.</p></div>
            <Switch checked={!!v.do_not_contact} disabled={busy}
              onCheckedChange={(c) => save(c ? { do_not_contact: true, status: "do_not_contact" } : { do_not_contact: false, status: "new" })} />
          </div>
          <div className="space-y-1"><Label>Status</Label>
            <Select value={v.status ?? "new"} onValueChange={(x) => setV((s) => ({ ...s, status: x }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_STATUSES.map((p) => <SelectItem key={p} value={p}>{nice(p)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <LeadFields v={v} set={(p) => setV((s) => ({ ...s, ...p }))} />
          <Button className="w-full" disabled={busy} onClick={() => save()}>Save changes</Button>
          <div>
            <h3 className="font-semibold mb-2">Outreach history</h3>
            {history.length === 0 ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex justify-between gap-2"><span className="font-medium">{CHANNEL_LABEL[h.channel] ?? h.channel}</span><Badge variant="outline">{nice(h.status)}</Badge></div>
                    {h.subject && <p className="mt-1">{h.subject}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(h.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Channels ---------------- */

function ChannelsTab() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [last, setLast] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("agent_settings").select("*").order("key");
    if (error) toast.error(error.message);
    setSettings(data ?? []);
    const entries = await Promise.all((data ?? []).map(async (s) => {
      const { data: r } = await supabase.from("agent_outreach").select("created_at").eq("workflow", s.key).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return [s.key, r?.created_at ?? null] as const;
    }));
    setLast(Object.fromEntries(entries));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (settings === null) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  if (settings.length === 0) return <Empty title="No channels set up" />;
  return <div className="space-y-4">{settings.map((s) => <ChannelCard key={s.key} s={s} lastAt={last[s.key] ?? null} onSaved={load} />)}</div>;
}

function ChipEditor({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (t && !values.includes(t)) onChange([...values, t]); setDraft(""); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {values.map((k) => (
          <Badge key={k} variant="secondary" className="gap-1 py-1">{k}
            <button onClick={() => onChange(values.filter((x) => x !== k))} aria-label={`Remove ${k}`}><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" onClick={add}>Add</Button>
      </div>
    </div>
  );
}

function ChannelCard({ s, lastAt, onSaved }: { s: Setting; lastAt: string | null; onSaved: () => void }) {
  const [cfg, setCfg] = useState<Record<string, any>>((s.config as Record<string, any>) ?? {});
  const [busy, setBusy] = useState(false);
  const set = (p: Record<string, any>) => setCfg((c) => ({ ...c, ...p }));
  const addressBlocked = s.key === "email_outreach" && (!String(cfg.physical_address ?? "").trim() || String(cfg.physical_address ?? "").includes("[STREET]"));

  const write = async (patch: Partial<Setting>, msg: string) => {
    setBusy(true);
    // Re-read so we merge into the latest config and never drop keys we don't edit here.
    const { data: cur } = await supabase.from("agent_settings").select("config").eq("key", s.key).maybeSingle();
    const merged = { ...((cur?.config as Record<string, any>) ?? {}), ...cfg };
    const { error } = await supabase.from("agent_settings").update({ config: merged, updated_at: now(), ...patch }).eq("key", s.key);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(msg);
    onSaved();
  };

  const keywords: string[] = Array.isArray(cfg.keywords) ? cfg.keywords : [];
  const feeds: string[] = Array.isArray(cfg.feeds) ? cfg.feeds : [];
  const preview = String(cfg.dm_template ?? "").replace(/\{username\}/g, "cardcollector42").replace(/\{link\}/g, `${cfg.base_url ?? "https://mycollectai.com"}?ref=ig_123`);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-lg">{WORKFLOW_LABEL[s.key] ?? s.key}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Last activity: {lastAt ? new Date(lastAt).toLocaleString() : "none yet"}</p>
        </div>
        <Switch className="scale-125 origin-top-right" checked={s.enabled} disabled={busy || (addressBlocked && !s.enabled)}
          onCheckedChange={(c) => write({ enabled: c }, c ? "Channel on" : "Channel off")} />
      </CardHeader>
      <CardContent className="space-y-4">
        {s.key === "ig_comment_dm" && (<>
          <div className="space-y-1"><Label>Trigger keywords</Label><ChipEditor values={keywords} onChange={(k) => set({ keywords: k })} placeholder="e.g. value" /></div>
          <div className="space-y-1"><Label>DM template</Label>
            <Textarea rows={4} value={cfg.dm_template ?? ""} onChange={(e) => set({ dm_template: e.target.value })} />
            <p className={`text-xs ${String(cfg.dm_template ?? "").length > 300 ? "text-destructive" : "text-muted-foreground"}`}>
              Use {"{username}"} and {"{link}"}. Under 300 characters. ({String(cfg.dm_template ?? "").length})
            </p>
          </div>
          {preview && <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap"><p className="text-xs text-muted-foreground mb-1">Preview</p>{preview}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Daily cap</Label><Input type="number" min={0} value={cfg.daily_cap ?? ""} onChange={(e) => set({ daily_cap: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label>Base URL</Label><Input readOnly value={cfg.base_url ?? ""} className="bg-muted" /></div>
          </div>
        </>)}
        {s.key === "community_drafts" && (<>
          <div className="space-y-1"><Label>Feeds</Label>
            <div className="space-y-2">
              {feeds.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={f} onChange={(e) => set({ feeds: feeds.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <Button variant="outline" size="icon" onClick={() => set({ feeds: feeds.filter((_, j) => j !== i) })} aria-label="Remove feed"><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set({ feeds: [...feeds, ""] })} className="gap-1"><Plus className="h-4 w-4" />Add feed</Button>
            </div>
          </div>
          <div className="space-y-1"><Label>Keywords</Label><ChipEditor values={keywords} onChange={(k) => set({ keywords: k })} placeholder="e.g. how much is" /></div>
          <div className="space-y-1 sm:w-1/2"><Label>Max drafts per run</Label><Input type="number" min={0} value={cfg.max_per_run ?? ""} onChange={(e) => set({ max_per_run: Number(e.target.value) })} /></div>
        </>)}
        {s.key === "email_outreach" && (<>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>From email</Label><Input value={cfg.from_email ?? ""} onChange={(e) => set({ from_email: e.target.value })} /></div>
            <div className="space-y-1"><Label>Reply-to</Label><Input value={cfg.reply_to ?? ""} onChange={(e) => set({ reply_to: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Physical address *</Label>
            <Textarea rows={2} value={cfg.physical_address ?? ""} onChange={(e) => set({ physical_address: e.target.value })} />
            <p className="text-xs text-muted-foreground">Your real mailing address. Required by law for cold email.</p>
            {addressBlocked && <p className="text-xs text-destructive">Email outreach can't be turned on until you replace the placeholder with your real address and save.</p>}
          </div>
          <div className="space-y-1 sm:w-1/2"><Label>Daily cap</Label><Input type="number" min={0} value={cfg.daily_cap ?? ""} onChange={(e) => set({ daily_cap: Number(e.target.value) })} /></div>
        </>)}
        <Button disabled={busy} onClick={() => {
          const p = s.key === "email_outreach" ? String(cfg.physical_address ?? "") : "";
          const turnOff = s.key === "email_outreach" && s.enabled && (!p.trim() || p.includes("[STREET]"));
          write(turnOff ? { enabled: false } : {}, "Saved");
        }}>Save settings</Button>
      </CardContent>
    </Card>
  );
}

/* ---------------- Results ---------------- */

function ResultsTab() {
  const [funnel, setFunnel] = useState<Funnel[] | null>(null);
  const [week, setWeek] = useState<Outreach[]>([]);
  const [failed, setFailed] = useState<Outreach[]>([]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [f, w, x] = await Promise.all([
      supabase.from("agent_funnel").select("*"),
      supabase.from("agent_outreach").select("*").gte("sent_at", since).limit(2000),
      supabase.from("agent_outreach").select("*").eq("status", "failed").order("created_at", { ascending: false }).limit(100),
    ]);
    setFunnel(f.data ?? []);
    setWeek(w.data ?? []);
    setFailed(x.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const tiles = useMemo(() => {
    const done = week.filter((o) => o.status === "sent" || o.status === "posted_manually");
    const recentManual = week.length; // sent_at-based window
    void recentManual;
    return [
      { l: "DMs sent", v: done.filter((o) => o.channel === "instagram_dm").length },
      { l: "Emails sent", v: done.filter((o) => o.channel === "email").length },
      { l: "Replies posted", v: done.filter((o) => o.channel === "reddit_reply" || o.channel === "discord_reply").length },
      { l: "Sign-ups attributed", v: (funnel ?? []).reduce((a, r) => a + (r.signups ?? 0), 0) },
    ];
  }, [week, funnel]);

  const chart = useMemo(() => {
    const groups: Record<string, { name: string; visits: number; demo_scans: number; signups: number; paid: number }> = {};
    for (const r of funnel ?? []) {
      const c = (r.channel ?? "other").toLowerCase();
      const k = c.startsWith("ig") || c.includes("insta") ? "ig" : c.includes("reddit") ? "reddit" : c.includes("email") ? "email" : c;
      groups[k] ??= { name: k, visits: 0, demo_scans: 0, signups: 0, paid: 0 };
      groups[k].visits += r.visits ?? 0; groups[k].demo_scans += r.demo_scans ?? 0;
      groups[k].signups += r.signups ?? 0; groups[k].paid += r.paid ?? 0;
    }
    return Object.values(groups);
  }, [funnel]);

  const top = [...(funnel ?? [])].sort((a, b) => (b.signups ?? 0) - (a.signups ?? 0)).slice(0, 15);

  const retry = async (id: string) => {
    const { error } = await supabase.from("agent_outreach").update({ status: "approved", error: null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Queued to send again");
    load();
  };

  if (funnel === null) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-2">Last 7 days</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <Card key={t.l}><CardContent className="p-4"><p className="text-3xl font-bold">{t.v}</p><p className="text-xs text-muted-foreground mt-1">{t.l}</p></CardContent></Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">By channel</CardTitle></CardHeader>
        <CardContent>
          {chart.length === 0 ? <Empty title="No tracked visits yet" hint="Results appear once people click your ref links." /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="visits" name="Visits" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="demo_scans" name="Demo scans" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="signups" name="Sign-ups" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" name="Paid" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Top ref codes</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {top.length === 0 ? <p className="text-sm text-muted-foreground">No ref codes yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Ref</TableHead><TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Sign-ups</TableHead><TableHead className="text-right">Conv.</TableHead></TableRow></TableHeader>
              <TableBody>
                {top.map((r) => (
                  <TableRow key={`${r.ref_code}-${r.channel}`}>
                    <TableCell className="font-mono text-xs">{r.ref_code}</TableCell>
                    <TableCell className="text-right">{r.visits ?? 0}</TableCell>
                    <TableCell className="text-right">{r.signups ?? 0}</TableCell>
                    <TableCell className="text-right">{r.visits ? `${(((r.signups ?? 0) / r.visits) * 100).toFixed(1)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Failed</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {failed.length === 0 ? <p className="text-sm text-muted-foreground">Nothing failed. Nice.</p> : failed.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{CHANNEL_LABEL[f.channel] ?? f.channel} · {new Date(f.created_at).toLocaleString()}</p>
                <p className="text-destructive text-xs break-words">{f.error || "Unknown error"}</p>
              </div>
              {f.channel === "email" && <Button size="sm" variant="outline" onClick={() => retry(f.id)}>Retry</Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
