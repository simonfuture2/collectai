import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countsByRef, funnelSteps, type FunnelRow } from "@/lib/funnel";

const STEP_LABEL: Record<string, string> = { landing_view: "Home page view", demo_result: "Demo result", signup: "Sign-up", first_scan: "First scan" };

export default function FunnelTab() {
  const [days, setDays] = useState<7 | 30>(7);
  const [rows, setRows] = useState<FunnelRow[] | null>(null);
  const [ref, setRef] = useState<string>("all");

  useEffect(() => {
    setRows(null);
    supabase.rpc("agent_event_funnel", { _days: days }).then(({ data }) => setRows((data as FunnelRow[] | null) ?? []));
  }, [days]);

  if (!rows) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const table = countsByRef(rows);
  const steps = funnelSteps(rows, ref === "all" ? undefined : ref);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([7, 30] as const).map(d => <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>Last {d} days</Button>)}
        <span className="mx-2 h-5 w-px bg-border" />
        {["all", ...table.refs].map(r => <Button key={r} size="sm" variant={ref === r ? "secondary" : "ghost"} onClick={() => setRef(r)}>{r === "all" ? "All sources" : r}</Button>)}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Conversion (people)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {steps.map(s => (
            <div key={s.step} className="rounded-xl bg-muted p-3">
              <p className="text-xs text-muted-foreground">{STEP_LABEL[s.step]}</p>
              <p className="text-2xl font-bold">{s.people}</p>
              <p className="text-xs text-muted-foreground">{s.rate == null ? (s.step === "landing_view" ? "start" : "—") : `${s.rate}% of previous`}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Events by source</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Event</TableHead><TableHead className="text-right">Total</TableHead>{table.refs.map(r => <TableHead key={r} className="text-right">{r}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {table.rows.map(r => (
                <TableRow key={r.event}><TableCell className="font-mono text-xs">{r.event}</TableCell><TableCell className="text-right font-semibold">{r.total}</TableCell>
                  {table.refs.map(ref => <TableCell key={ref} className="text-right">{r.byRef[ref] || ""}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
