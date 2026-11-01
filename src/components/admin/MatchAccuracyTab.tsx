import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = { game: string; total: number; top1_pct: number; top3_pct: number };

const MatchAccuracyTab = () => {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    supabase.rpc("price_check_accuracy", { _days: days }).then(({ data, error }) => {
      if (!live) return;
      setError(error ? "Could not load accuracy." : null);
      setRows(((data ?? []) as Row[]).map(r => ({ ...r, total: Number(r.total), top1_pct: Number(r.top1_pct), top3_pct: Number(r.top3_pct) })));
      setLoading(false);
    });
    return () => { live = false; };
  }, [days]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle>Price check match accuracy</CardTitle>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>{d} days</Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : error ? <p className="text-sm text-destructive">{error}</p>
          : !rows.length ? <p className="text-sm text-muted-foreground">No price checks in this period.</p>
          : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="game" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis domain={[0, 100]} unit="%" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend />
                    <Bar dataKey="top1_pct" name="Correct at #1" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="top3_pct" name="In top 3" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Game</TableHead><TableHead className="text-right">Checks</TableHead><TableHead className="text-right">#1</TableHead><TableHead className="text-right">Top 3</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.game}>
                      <TableCell className="capitalize">{r.game}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right">{r.top1_pct}%</TableCell>
                      <TableCell className="text-right">{r.top3_pct}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">A check counts as correct at #1 when the user kept the first match. Picks made through search count as outside the top 3.</p>
            </>
          )}
      </CardContent>
    </Card>
  );
};

export default MatchAccuracyTab;
