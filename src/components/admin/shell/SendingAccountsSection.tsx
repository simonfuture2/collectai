import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Acct = Database["public"]["Tables"]["sending_accounts"]["Row"];
interface Cap { capacity: number; used: number; accounts: { id: string; capacity: number; used: number }[] }

export default function SendingAccountsSection() {
  const [rows, setRows] = useState<Acct[] | null>(null);
  const [cap, setCap] = useState<Cap | null>(null);
  const [n, setN] = useState({ email: "", display_name: "Simon from MyCollectAI", provider: "gmail", daily_limit: "30", warmup_start_date: new Date().toISOString().slice(0, 10) });
  const load = useCallback(async () => {
    const [{ data }, { data: c }] = await Promise.all([supabase.from("sending_accounts").select("*").order("created_at"), supabase.rpc("cold_capacity_today")]);
    setRows(data ?? []); setCap(c as unknown as Cap);
  }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    const email = n.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter the inbox email");
    const domain = email.split("@")[1];
    if (domain === "mycollectai.com") return toast.error("Use a separate domain for cold inboxes, never mycollectai.com");
    const { error } = await supabase.from("sending_accounts").insert({ email, domain, display_name: n.display_name || null, provider: n.provider, daily_limit: Number(n.daily_limit) || 30, warmup_start_date: n.warmup_start_date || null });
    if (error) return toast.error(error.message);
    setN({ ...n, email: "" }); load();
  };
  const update = async (id: string, patch: Partial<Acct>) => { const { error } = await supabase.from("sending_accounts").update(patch).eq("id", id); if (error) toast.error(error.message); load(); };
  const remove = async (id: string) => { if (!confirm("Remove this inbox?")) return; const { error } = await supabase.from("sending_accounts").delete().eq("id", id); if (error) toast.error("It has sent emails, so pause it instead"); load(); };
  const [testing, setTesting] = useState(false);
  const sendTest = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("gmail-cold-send", { body: { test_to: "mycollectaiteam@gmail.com" } });
    setTesting(false);
    if (error || data?.error) return toast.error(data?.error ?? "Test send failed");
    toast.success(`Test copy sent from ${data.from}`);
  };
  const capOf = (id: string) => cap?.accounts?.find((a) => a.id === id);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Cold sending inboxes</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Cold emails only go out from these inboxes. Put them on separate lookalike domains (e.g. getmycollectai.com, mycollectai.co), never mycollectai.com, so account emails keep landing. Connected Gmail inboxes send from the app and are checked every 30 minutes for bounces and replies. Inboxes without a connection are left for n8n.</p>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Today: {cap?.used ?? 0} of {cap?.capacity ?? 0} cold emails used</p><Button size="sm" variant="outline" onClick={sendTest} disabled={testing}>{testing && <Loader2 className="h-4 w-4 animate-spin" />}Send test copy</Button></div>
        {rows === null ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No inboxes yet. Cold sending is paused until you add one.</p> : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {rows.map((a) => (
              <div key={a.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="min-w-0 flex-1"><p className="font-medium truncate">{a.email}</p>
                  <p className="text-xs text-muted-foreground">{a.provider} · today {capOf(a.id)?.used ?? 0}/{capOf(a.id)?.capacity ?? 0} · limit {a.daily_limit}{a.warmup_start_date ? ` · warming up since ${a.warmup_start_date}` : ""}{a.paused_reason ? ` · ${a.paused_reason}` : ""}</p>
                  {a.provider === "gmail" && <p className={`text-xs ${a.check_error ? "text-destructive" : "text-muted-foreground"}`}>{!a.connection_secret ? "Not connected (n8n)" : a.check_error ? "Needs reconnect: " + a.check_error.slice(0, 120) : a.last_checked_at ? `Connected · inbox checked ${new Date(a.last_checked_at).toLocaleString()}` : "Connected · not checked yet"}</p>}</div>
                <Input type="number" className="w-20" defaultValue={a.daily_limit} onBlur={(e) => Number(e.target.value) !== a.daily_limit && update(a.id, { daily_limit: Number(e.target.value) || 30 })} aria-label="Daily limit" />
                <Switch checked={a.active} onCheckedChange={(v) => update(a.id, { active: v, paused_reason: v ? null : "Paused by admin" })} aria-label="Active" />
                <Button variant="ghost" size="icon" onClick={() => remove(a.id)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_1.3fr_auto]">
          <Input placeholder="simon@getmycollectai.com" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />
          <Input placeholder="From name" value={n.display_name} onChange={(e) => setN({ ...n, display_name: e.target.value })} />
          <Select value={n.provider} onValueChange={(v) => setN({ ...n, provider: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="gmail">Gmail</SelectItem><SelectItem value="instantly">Instantly</SelectItem></SelectContent>
          </Select>
          <Input type="number" value={n.daily_limit} onChange={(e) => setN({ ...n, daily_limit: e.target.value })} aria-label="Daily limit" />
          <Input type="date" value={n.warmup_start_date} onChange={(e) => setN({ ...n, warmup_start_date: e.target.value })} aria-label="Warm-up start" />
          <Button onClick={add} className="gap-1"><Plus className="h-4 w-4" />Add</Button>
        </div>
        <p className="text-xs text-muted-foreground">Warm-up: 5 emails on the start day, 3 more each day after, up to the daily limit. Leave the date empty for an inbox that's already warmed up.</p>
      </CardContent>
    </Card>
  );
}
