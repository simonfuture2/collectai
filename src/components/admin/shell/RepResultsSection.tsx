import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { startOfMonth, startOfWeek } from "@/lib/salesReps";

type Stats = { touches: number; replies: number; meetings: number; partners: number; signups: number; calls: number; emails: number; dms: number };
type Board = { user_id: string; display_name: string; active: boolean; stats: Stats };
type Comm = { user_id: string; display_name: string; ref_code: string; commission_rate: number; signups: number; paid_users: number; paid_conversions: number; revenue_cents: number; commission_cents: number };
const usd = (c: number) => `$${(Number(c) / 100).toFixed(2)}`;

export default function RepResultsSection() {
  const [board, setBoard] = useState<Board[] | null>(null);
  const [comm, setComm] = useState<Comm[]>([]);
  const [month, setMonth] = useState(() => startOfMonth().toISOString().slice(0, 7));
  useEffect(() => {
    supabase.rpc("rep_leaderboard", { _since: startOfWeek().toISOString() }).then(({ data }) => setBoard((data as unknown as Board[]) ?? []));
  }, []);
  useEffect(() => {
    const since = new Date(`${month}-01T00:00:00`); const until = new Date(since.getFullYear(), since.getMonth() + 1, 1);
    supabase.rpc("rep_commission_report", { _since: since.toISOString(), _until: until.toISOString() }).then(({ data }) => setComm((data as unknown as Comm[]) ?? []));
  }, [month]);
  if (!board) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  if (!board.length) return null;
  const sorted = [...board].sort((a, b) => b.stats.touches - a.stats.touches);
  return (
    <div className="space-y-4 mb-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Rep leaderboard · this week</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Rep</TableHead><TableHead className="text-right">Touches</TableHead><TableHead className="text-right">Replies</TableHead><TableHead className="text-right">Meetings</TableHead><TableHead className="text-right">Partners</TableHead></TableRow></TableHeader>
            <TableBody>{sorted.map((r) => (
              <TableRow key={r.user_id}><TableCell>{r.display_name}{!r.active && " (inactive)"}</TableCell>
                <TableCell className="text-right">{r.stats.touches}</TableCell><TableCell className="text-right">{r.stats.replies}</TableCell>
                <TableCell className="text-right">{r.stats.meetings}</TableCell><TableCell className="text-right">{r.stats.partners}</TableCell></TableRow>))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Commission report</CardTitle>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        </CardHeader>
        <CardContent className="overflow-x-auto space-y-2">
          <Table>
            <TableHeader><TableRow><TableHead>Rep</TableHead><TableHead className="text-right">Sign-ups</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Commission</TableHead></TableRow></TableHeader>
            <TableBody>{comm.map((r) => (
              <TableRow key={r.user_id}><TableCell>{r.display_name} <span className="text-xs text-muted-foreground">{r.ref_code}</span></TableCell>
                <TableCell className="text-right">{r.signups}</TableCell><TableCell className="text-right">{r.paid_conversions}</TableCell>
                <TableCell className="text-right">{usd(r.revenue_cents)}</TableCell><TableCell className="text-right">{r.commission_rate}%</TableCell>
                <TableCell className="text-right font-medium">{usd(r.commission_cents)}</TableCell></TableRow>))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">Counts people who signed up with the rep's link or with a partner the rep activated. Payments are counted in the month they happened. Reporting only — pay reps outside the app.</p>
        </CardContent>
      </Card>
    </div>
  );
}
