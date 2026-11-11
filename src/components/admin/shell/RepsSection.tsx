import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, Shuffle, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isValidRefCode, parseTerritories, suggestRefCode } from "@/lib/salesReps";

type Rep = Database["public"]["Tables"]["sales_reps"]["Row"];
type Invite = Database["public"]["Tables"]["sales_rep_invites"]["Row"];
type Lead = Pick<Database["public"]["Tables"]["agent_leads"]["Row"], "id" | "name" | "business_name" | "city" | "state" | "county" | "lead_type" | "created_at">;

function RepRow({ rep, onSaved }: { rep: Rep; onSaved: () => void }) {
  const [terr, setTerr] = useState(rep.territories.join(", "));
  const [goal, setGoal] = useState(String(rep.daily_touch_goal));
  const [rate, setRate] = useState(String(rep.commission_rate));
  const save = async (patch: Partial<Rep>) => {
    const { error } = await supabase.from("sales_reps").update(patch).eq("user_id", rep.user_id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  };
  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="min-w-0">
          <p className="font-medium">{rep.display_name} {!rep.active && <Badge variant="secondary">Inactive</Badge>}</p>
          <p className="text-xs text-muted-foreground">{rep.email} · ref <code>{rep.ref_code}</code></p>
        </div>
        <label className="flex items-center gap-2 text-sm">Active <Switch checked={rep.active} onCheckedChange={(v) => save({ active: v })} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_110px_110px_auto] items-end">
        <div><Label className="text-xs">Territories (MD or MD:Harford)</Label><Input value={terr} onChange={(e) => setTerr(e.target.value)} /></div>
        <div><Label className="text-xs">Daily touch goal</Label><Input type="number" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
        <div><Label className="text-xs">Commission %</Label><Input type="number" min={0} max={100} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <Button variant="outline" onClick={() => save({ territories: parseTerritories(terr), daily_touch_goal: Number(goal) || 0, commission_rate: Number(rate) || 0 })}>Save</Button>
      </div>
    </div>
  );
}

export default function RepsSection() {
  const [reps, setReps] = useState<Rep[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [unassigned, setUnassigned] = useState<Lead[]>([]);
  const [form, setForm] = useState({ email: "", name: "", ref: "", terr: "", goal: "50", rate: "10" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, i, u] = await Promise.all([
      supabase.from("sales_reps").select("*").order("display_name"),
      supabase.from("sales_rep_invites").select("*").is("accepted_at", null).order("created_at", { ascending: false }),
      supabase.from("agent_leads").select("id, name, business_name, city, state, county, lead_type, created_at").is("owner_id", null).is("merged_into", null).order("created_at", { ascending: false }).limit(100),
    ]);
    setReps(r.data ?? []); setInvites(i.data ?? []); setUnassigned(u.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    const ref = (form.ref || suggestRefCode(form.name)).toLowerCase();
    if (!form.email || !form.name) return toast.error("Add a name and email");
    if (!isValidRefCode(ref)) return toast.error("Ref code: lowercase letters, numbers, _ or -");
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_invite_rep", { _email: form.email, _display_name: form.name, _ref_code: ref,
      _territories: parseTerritories(form.terr), _goal: Number(form.goal) || 50, _rate: Number(form.rate) || 0 });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success((data as { status?: string })?.status === "added" ? "Rep added — they can open /reps now" : "Invite saved — they get access when they sign up with that email");
    setForm({ email: "", name: "", ref: "", terr: "", goal: "50", rate: "10" }); load();
  };
  const autoAssign = async () => {
    const { data, error } = await supabase.rpc("admin_assign_unassigned");
    if (error) toast.error(error.message); else { toast.success(`${(data as { assigned?: number })?.assigned ?? 0} leads assigned`); load(); }
  };
  const reassign = async (leadId: string, owner: string) => {
    const { error } = await supabase.rpc("admin_reassign_lead", { _lead_id: leadId, _owner: owner });
    if (error) toast.error(error.message); else load();
  };

  if (!reps) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  const link = `${window.location.origin}/reps`;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" />Invite a rep</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">They sign up with a normal account using this email, then open{" "}
            <button className="underline inline-flex items-center gap-1" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}>{link}<Copy className="h-3 w-3" /></button>. Reps never see the admin area.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, ref: form.ref || "" })} placeholder="Jamie Lee" /></div>
            <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label className="text-xs">Ref code</Label><Input value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder={suggestRefCode(form.name || "new")} /></div>
            <div><Label className="text-xs">Territories</Label><Input value={form.terr} onChange={(e) => setForm({ ...form, terr: e.target.value })} placeholder="MD:Harford, PA" /></div>
            <div><Label className="text-xs">Daily touch goal</Label><Input type="number" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></div>
            <div><Label className="text-xs">Commission % (reporting only)</Label><Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
          </div>
          <Button onClick={invite} disabled={busy} className="gradient-primary text-primary-foreground">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Invite rep</Button>
          {invites.length > 0 && <div className="text-sm space-y-1 pt-2"><p className="font-medium">Waiting to sign up</p>
            {invites.map((i) => <p key={i.email} className="text-muted-foreground">{i.display_name} · {i.email} · {i.territories.join(", ") || "no territory"}</p>)}</div>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="font-semibold">Reps ({reps.length})</h2>
        {reps.length === 0 ? <p className="text-sm text-muted-foreground">No reps yet.</p> : reps.map((r) => <RepRow key={r.user_id} rep={r} onSaved={load} />)}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Unassigned ({unassigned.length})</h2>
          <Button variant="outline" size="sm" onClick={autoAssign} disabled={!reps.some((r) => r.active)}><Shuffle className="h-4 w-4 mr-1" />Auto-assign by territory</Button>
        </div>
        <p className="text-xs text-muted-foreground">New leads go to a territory rep automatically, taking turns. Leads outside every territory wait here.</p>
        <div className="divide-y divide-border rounded-xl border border-border">
          {unassigned.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing waiting.</p>}
          {unassigned.map((l) => (
            <div key={l.id} className="p-3 flex flex-wrap items-center gap-2 justify-between">
              <div className="min-w-0"><p className="font-medium truncate">{l.business_name || l.name || "Unnamed"}</p>
                <p className="text-xs text-muted-foreground">{[l.city, l.county, l.state].filter(Boolean).join(", ")} · {l.lead_type.replace("_", " ")}</p></div>
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" defaultValue="" onChange={(e) => e.target.value && reassign(l.id, e.target.value)}>
                <option value="">Assign to…</option>
                {reps.filter((r) => r.active).map((r) => <option key={r.user_id} value={r.user_id}>{r.display_name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
