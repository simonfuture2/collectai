import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Loader2, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rate, toCsv, trend } from "@/lib/deliverability";

type Row = Record<string, string | number>;
interface Step { step_no: number; channel: string; sent: number; replied: number; interested: number }
interface Seq { id: string; name: string; lane: string; sent: number; people: number; replied: number; interested: number; meetings: number; partners: number; signups: number; steps: Step[] }
interface Report { sequences: Seq[]; by_type: Row[]; by_source: Row[]; shops: Row[]; reps: Row[]; active_shops: number; totals: Row }

const SOURCE: Record<string, string> = { places: "Google Places", partner_form: "Partner form", lead_magnet: "Lead magnet", event: "Event", csv: "CSV import", manual: "Added by hand" };
const pct = (n: number, d: number) => (d ? `${Math.round(rate(n, d) * 100)}%` : "–");

function Arrow({ cur, prev }: { cur: number; prev?: number }) {
  if (prev === undefined) return null;
  const t = trend(cur, prev);
  const I = t.dir === "up" ? ArrowUp : t.dir === "down" ? ArrowDown : Minus;
  return <I className={`inline h-3 w-3 ml-1 ${t.dir === "up" ? "text-primary" : t.dir === "down" ? "text-destructive" : "text-muted-foreground"}`} aria-label={`was ${prev}`} />;
}

function download(name: string, rows: Row[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

function Block({ title, name, rows, prev, keyCol, cols, label }: { title: string; name: string; rows: Row[]; prev: Row[]; keyCol: string; cols: string[]; label?: (v: string) => string }) {
  const prevBy = new Map(prev.map((r) => [String(r[keyCol]), r]));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => download(name, rows)}><Download className="h-4 w-4 mr-1" />CSV</Button></CardHeader>
      <CardContent className="overflow-x-auto">
        {!rows.length ? <p className="text-sm text-muted-foreground">Nothing in this period yet.</p> : (
          <Table><TableHeader><TableRow><TableHead /> {cols.map((c) => <TableHead key={c} className="text-right capitalize">{c.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{rows.map((r) => { const p = prevBy.get(String(r[keyCol])); return (
              <TableRow key={String(r[keyCol])}><TableCell>{label ? label(String(r[keyCol])) : String(r[keyCol])}</TableCell>
                {cols.map((c) => <TableCell key={c} className="text-right">{r[c]}{typeof r[c] === "number" && <Arrow cur={Number(r[c])} prev={p ? Number(p[c] ?? 0) : 0} />}</TableCell>)}</TableRow>); })}</TableBody></Table>)}
      </CardContent>
    </Card>
  );
}

export default function ResultsReport() {
  const [days, setDays] = useState(7);
  const [cur, setCur] = useState<Report | null>(null);
  const [prev, setPrev] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setCur(null);
    const now = Date.now(), d = days * 864e5;
    const call = (a: number, b: number) => supabase.rpc("results_report", { _since: new Date(a).toISOString(), _until: new Date(b).toISOString() });
    Promise.all([call(now - d, now), call(now - 2 * d, now - d)]).then(([a, b]) => {
      if (a.error) setErr(a.error.message); else { setCur(a.data as unknown as Report); setPrev(b.data as unknown as Report); }
    });
  }, [days]);

  const seqRows = useMemo<Row[]>(() => (cur?.sequences ?? []).filter((s) => s.sent).map((s) => ({ sequence: s.name, lane: s.lane, sent: s.sent, people: s.people, replied: s.replied, reply_rate: pct(s.replied, s.people), interested: s.interested, meetings: s.meetings, partners: s.partners, signups: s.signups })), [cur]);
  const stepRows = useMemo<Row[]>(() => (cur?.sequences ?? []).flatMap((s) => s.steps.filter((st) => st.sent).map((st) => ({ step: `${s.name} · step ${st.step_no}`, channel: st.channel, sent: st.sent, replied: st.replied, reply_rate: pct(st.replied, st.sent), interested: st.interested }))), [cur]);
  const toPrevSeq = (r: Report | null) => (r?.sequences ?? []).map((s) => ({ sequence: s.name, sent: s.sent, people: s.people, replied: s.replied, interested: s.interested, meetings: s.meetings, partners: s.partners, signups: s.signups }));
  const toPrevStep = (r: Report | null) => (r?.sequences ?? []).flatMap((s) => s.steps.map((st) => ({ step: `${s.name} · step ${st.step_no}`, sent: st.sent, replied: st.replied, interested: st.interested })));

  if (err) return <p className="text-destructive">Couldn't load results: {err}</p>;
  const t = cur?.totals, pt = prev?.totals;
  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((n) => <Button key={n} size="sm" variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>Last {n} days</Button>)}
        <span className="text-xs text-muted-foreground">Arrows compare with the {days} days before.</span>
      </div>
      {!cur ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /> : (<>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["sent", "replies", "interested", "meetings", "new_leads", "signups", "bounces", "complaints"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground capitalize">{k.replace("_", " ")}</p>
              <p className="text-xl font-bold">{t?.[k] ?? 0}<Arrow cur={Number(t?.[k] ?? 0)} prev={Number(pt?.[k] ?? 0)} /></p></div>))}
        </div>
        <Block title="Sequences: sent → replied → interested → meeting → partner / sign-up" name="sequences" rows={seqRows} prev={toPrevSeq(prev)} keyCol="sequence" cols={["sent", "people", "replied", "reply_rate", "interested", "meetings", "partners", "signups"]} />
        <Block title="Per step" name="sequence-steps" rows={stepRows} prev={toPrevStep(prev)} keyCol="step" cols={["sent", "replied", "reply_rate", "interested"]} />
        <p className="text-xs text-muted-foreground -mt-2">Meetings, partners and sign-ups count people each sequence emailed in this period who have reached that point by now.</p>
        <Block title="By lead type (leads added in this period)" name="by-lead-type" rows={cur.by_type} prev={prev?.by_type ?? []} keyCol="key" cols={["leads", "contacted", "replied", "meetings", "partners", "signups"]} label={(v) => v.replace(/_/g, " ")} />
        <Block title="By source (leads added in this period)" name="by-source" rows={cur.by_source} prev={prev?.by_source ?? []} keyCol="key" cols={["leads", "contacted", "replied", "meetings", "partners", "signups"]} label={(v) => SOURCE[v] ?? v} />
        <Block title={`Partner shops · ${cur.active_shops} active`} name="partner-shops" rows={cur.shops} prev={prev?.shops ?? []} keyCol="name" cols={["status", "signups", "signups_total", "conversions"]} />
        <Block title="Reps" name="reps" rows={cur.reps} prev={prev?.reps ?? []} keyCol="name" cols={["touches", "replies", "meetings", "partners", "signups"]} />
      </>)}
    </div>
  );
}
