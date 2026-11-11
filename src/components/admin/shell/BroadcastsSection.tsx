import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Loader2, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STAGES } from "@/lib/adminSections";

type Tpl = Database["public"]["Tables"]["email_templates"]["Row"];
interface Filters {
  lead_types?: string[]; stages?: string[]; sources?: string[]; tags?: string[]; states?: string[];
  contacted?: "any" | "contacted" | "never"; last_contacted_before?: string; never_replied?: boolean;
  include_leads?: boolean; include_users?: boolean; user_plans?: string[]; users_active_within_days?: number; lane?: "auto" | "cold" | "opted_in";
}
interface Draft { name: string; template_id: string; filters: Filters; spread_days: number; ref_code: string }
interface Sample { email: string; lane: string; subject: string; text: string; problem?: string | null }
interface Audience { counts: { cold: number; opted_in: number }; excluded: Record<string, number>; samples: Sample[]; total: number; cold_capacity?: { capacity: number; used: number } | null }

const nice = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const LEAD_TYPES = ["card_shop", "seller", "collector", "creator", "other"];
const SOURCES = ["manual", "csv", "places", "partner_form", "lead_magnet", "instagram", "tiktok", "reddit", "discord", "event", "referral"];

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("broadcast-send", { body });
  if (error) {
    const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(d?.error ?? error.message);
  }
  return data as T;
}

function Multi({ label, options, value, onChange }: { label: string; options: string[]; value?: string[]; onChange: (v: string[]) => void }) {
  const v = value ?? [];
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Button key={o} type="button" size="sm" variant={v.includes(o) ? "default" : "outline"} className="h-7 px-2 text-xs"
            onClick={() => onChange(v.includes(o) ? v.filter((x) => x !== o) : [...v, o])}>{nice(o)}</Button>
        ))}
      </div>
    </div>
  );
}

const storyFilters = (types: string[]): Filters => ({ lead_types: types, contacted: "contacted", never_replied: true, include_leads: true, lane: "auto" });

function Composer({ templates, initial, onDone }: { templates: Tpl[]; initial: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [aud, setAud] = useState<Audience | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setD(initial); setAud(null); }, [initial]);
  const f = d.filters;
  const setF = (p: Partial<Filters>) => { setD({ ...d, filters: { ...f, ...p } }); setAud(null); };

  const check = async () => {
    setBusy("check");
    try { setAud(await call<Audience>({ action: "audience", filters: f, template_id: d.template_id || undefined, ref_code: d.ref_code })); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const test = async () => {
    if (!d.template_id) return toast.error("Pick a template");
    setBusy("test");
    try { const r = await call<{ sent_to: string }>({ action: "test", template_id: d.template_id, ref_code: d.ref_code }); toast.success(`Test sent to ${r.sent_to}`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const schedule = async () => {
    if (!aud) return;
    if (!confirm(`Schedule ${aud.total} emails (${aud.counts.cold} cold, ${aud.counts.opted_in} opted in) over ${d.spread_days} weekday(s)?`)) return;
    setBusy("send");
    try { await call({ action: "create", ...d }); toast.success("Broadcast scheduled"); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{d.name || "New broadcast"}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Name</Label><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Template</Label>
            <Select value={d.template_id} onValueChange={(v) => { setD({ ...d, template_id: v }); setAud(null); }}>
              <SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger>
              <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Lane</Label>
            <Select value={f.lane ?? "auto"} onValueChange={(v) => setF({ lane: v as Filters["lane"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="auto">Split automatically</SelectItem><SelectItem value="cold">Cold only (inboxes)</SelectItem><SelectItem value="opted_in">Opted in only (SendGrid)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Spread over (weekdays)</Label><Input type="number" min={1} value={d.spread_days} onChange={(e) => setD({ ...d, spread_days: Math.max(1, Number(e.target.value) || 1) })} /></div>
            <div className="space-y-1"><Label>Ref code</Label><Input value={d.ref_code} onChange={(e) => setD({ ...d, ref_code: e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase() })} /></div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <label className="flex items-center gap-2"><Switch checked={f.include_leads !== false} onCheckedChange={(v) => setF({ include_leads: v })} />Leads</label>
          <label className="flex items-center gap-2"><Switch checked={!!f.include_users} onCheckedChange={(v) => setF({ include_users: v })} />App users (opted in only)</label>
          <label className="flex items-center gap-2"><Switch checked={!!f.never_replied} onCheckedChange={(v) => setF({ never_replied: v })} />Never replied</label>
        </div>
        {f.include_leads !== false && <div className="grid gap-3">
          <Multi label="Lead type" options={LEAD_TYPES} value={f.lead_types} onChange={(v) => setF({ lead_types: v })} />
          <Multi label="Stage" options={[...LEAD_STAGES]} value={f.stages} onChange={(v) => setF({ stages: v })} />
          <Multi label="Source" options={SOURCES} value={f.sources} onChange={(v) => setF({ sources: v })} />
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="space-y-1"><Label>Contacted</Label>
              <Select value={f.contacted ?? "any"} onValueChange={(v) => setF({ contacted: v as Filters["contacted"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="contacted">At least once</SelectItem><SelectItem value="never">Never</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Last contacted before</Label><Input type="date" value={f.last_contacted_before ?? ""} onChange={(e) => setF({ last_contacted_before: e.target.value || undefined })} /></div>
            <div className="space-y-1"><Label>States (comma)</Label><Input placeholder="MD, VA" value={(f.states ?? []).join(", ")} onChange={(e) => setF({ states: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} /></div>
            <div className="space-y-1"><Label>Tags (comma)</Label><Input value={(f.tags ?? []).join(", ")} onChange={(e) => setF({ tags: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></div>
          </div>
        </div>}
        {f.include_users && <div className="grid gap-2 sm:grid-cols-2">
          <Multi label="User plan" options={["free", "pro"]} value={f.user_plans} onChange={(v) => setF({ user_plans: v })} />
          <div className="space-y-1"><Label>Active in the last (days)</Label><Input type="number" value={f.users_active_within_days ?? ""} onChange={(e) => setF({ users_active_within_days: Number(e.target.value) || undefined })} /></div>
        </div>}
        <p className="text-xs text-muted-foreground">Always left out: unsubscribed, do-not-contact, not interested, replied in the last 30 days, and anyone in an active sequence. Cold emails send on weekdays, 8:30–17:00 in the recipient's time.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={check} disabled={!!busy} className="gap-1">{busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Check audience</Button>
          <Button variant="outline" onClick={test} disabled={!!busy || !d.template_id}>{busy === "test" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Send test to me</Button>
          <Button onClick={schedule} disabled={!!busy || !aud || !aud.total || !d.template_id || !d.name} className="gap-1"><Send className="h-4 w-4" />Schedule</Button>
        </div>
        {aud && <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border p-3"><p className="text-2xl font-bold">{aud.counts.cold}</p><p className="text-xs text-muted-foreground">Cold (inboxes)</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-2xl font-bold">{aud.counts.opted_in}</p><p className="text-xs text-muted-foreground">Opted in (SendGrid)</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-2xl font-bold">{Object.values(aud.excluded).reduce((a, b) => a + b, 0)}</p><p className="text-xs text-muted-foreground">Left out</p></div>
          </div>
          {Object.keys(aud.excluded).length > 0 && <p className="text-xs text-muted-foreground">Left out: {Object.entries(aud.excluded).map(([k, v]) => `${nice(k)} ${v}`).join(" · ")}</p>}
          {aud.counts.cold > 0 && <p className="text-xs">Cold capacity today: {aud.cold_capacity?.capacity ?? 0} across your inboxes{(aud.cold_capacity?.capacity ?? 0) === 0 ? ". Cold emails wait until you add an inbox in Channels." : ""}</p>}
          {aud.samples.map((s) => (
            <div key={s.email} className="rounded-lg border border-border p-3 text-sm space-y-1">
              <div className="flex justify-between gap-2"><span className="font-medium truncate">{s.email}</span><Badge variant="outline">{s.lane === "cold" ? "Cold" : "Opted in"}</Badge></div>
              <p className="font-medium">{s.subject}</p>
              <pre className="whitespace-pre-wrap font-sans text-muted-foreground max-h-64 overflow-auto">{s.text}</pre>
              {s.problem && <p className="text-destructive text-xs">{s.problem}</p>}
            </div>
          ))}
        </div>}
      </CardContent>
    </Card>
  );
}

interface Stat { id: string; name: string; ref_code: string; status: string; total: number; cold: number; opted_in: number; queued: number; sent: number; failed: number; bounced: number; replied: number; unsubscribed: number; signups: number; created_at: string }

export default function BroadcastsSection() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("email_templates").select("*").order("name"); setTemplates(data ?? []);
    try { setStats((await call<{ broadcasts: Stat[] }>({ action: "stats" })).broadcasts); } catch (e) { toast.error((e as Error).message); setStats([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const tplId = (name: string) => templates.find((t) => t.name.includes(name))?.id ?? "";
  const cancel = async (id: string) => { if (!confirm("Cancel the emails that haven't gone out yet?")) return; await call({ action: "cancel", id }); load(); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDraft({ name: "", template_id: "", filters: { include_leads: true, lane: "auto" }, spread_days: 1, ref_code: "" })}>New broadcast</Button>
        <Button variant="outline" onClick={() => setDraft({ name: "Story update - Collectors & creators", template_id: tplId("Collectors & creators"), filters: storyFilters(["collector", "creator"]), spread_days: 5, ref_code: "bc_story_collectors" })}>Story email: collectors & creators</Button>
        <Button variant="outline" onClick={() => setDraft({ name: "Story update - Card shops", template_id: tplId("Card shops"), filters: storyFilters(["card_shop", "seller"]), spread_days: 5, ref_code: "bc_story_shops" })}>Story email: card shops</Button>
      </div>
      {draft && <Composer templates={templates} initial={draft} onDone={() => { setDraft(null); load(); }} />}
      <Card>
        <CardHeader><CardTitle className="text-base">Broadcasts</CardTitle></CardHeader>
        <CardContent>
          {stats === null ? <Loader2 className="h-5 w-5 animate-spin" /> : stats.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground text-left"><tr>{["Broadcast", "Cold", "Opted in", "Queued", "Sent", "Failed", "Bounced", "Replied", "Unsub", "Sign-ups", ""].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>{stats.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="p-2"><p className="font-medium">{b.name}</p><p className="text-xs text-muted-foreground">{b.ref_code} · {nice(b.status)}</p></td>
                    {[b.cold, b.opted_in, b.queued, b.sent, b.failed, b.bounced, b.replied, b.unsubscribed, b.signups].map((v, i) => <td key={i} className="p-2">{v}</td>)}
                    <td className="p-2">{["scheduled", "sending"].includes(b.status) && <Button size="sm" variant="ghost" onClick={() => cancel(b.id)}>Cancel</Button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
