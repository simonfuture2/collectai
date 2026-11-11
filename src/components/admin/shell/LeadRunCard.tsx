import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/** Latest daily lead run: found, enriched, emails found, enrolled, skipped and why. */
export default function LeadRunCard() {
  const [run, setRun] = useState<{ created_at: string; summary: any } | null>(null);
  useEffect(() => { supabase.from("agent_lead_runs").select("created_at, summary").order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setRun(data as any)); }, []);
  if (!run) return null;
  const s = run.summary ?? {};
  const stats: [string, number][] = [["Found", s.found ?? 0], ["New leads", s.imported ?? 0], ["Websites read", s.enriched ?? 0], ["Emails found", s.emails_found ?? 0], ["Enrolled", s.enrolled ?? 0]];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Lead run · {new Date(run.created_at).toLocaleString()}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {s.cities?.length > 0 && <p className="text-muted-foreground">Searched {s.cities.join(", ")}</p>}
        <div className="grid grid-cols-5 gap-2">{stats.map(([l, v]) => <div key={l}><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold">{v}</p></div>)}</div>
        {Object.keys(s.skipped ?? {}).length > 0 && <div><p className="text-xs text-muted-foreground">Skipped</p>{Object.entries(s.skipped).map(([k, v]) => <p key={k}>{String(v)} · {k}</p>)}</div>}
      </CardContent>
    </Card>
  );
}
