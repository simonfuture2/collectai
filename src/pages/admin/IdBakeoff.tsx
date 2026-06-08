import { useState, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAdmin } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type IdResult = {
  card_name?: string | null;
  card_number?: string | null;
  card_set?: string | null;
  card_year?: string | null;
  variant?: string | null;
  rarity?: string | null;
};

type ModelCall = { result: IdResult | null; latency_ms: number; error?: string | null };

type Row = {
  cardId: string;
  image_url: string | null;
  claude: IdResult | null;
  gemini_flash: ModelCall;
  gemini_pro: ModelCall;
  truth: (IdResult & { card_id?: string; notes?: string | null }) | null;
  error?: string;
};

const TRUTH_FIELDS: (keyof IdResult)[] = ["card_name", "card_number", "card_set", "card_year", "variant", "rarity"];
const SCORED_FIELDS: (keyof IdResult)[] = ["card_name", "card_number", "card_set", "card_year", "variant", "rarity"];

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase();
}
function match(a: any, b: any) {
  const na = norm(a), nb = norm(b);
  return na && nb && na === nb;
}

export default function IdBakeoff() {
  const { isAdmin, loading } = useAdmin();
  const [limit, setLimit] = useState(5);
  const [cardIdsText, setCardIdsText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, IdResult>>({});

  if (loading) return <div className="p-8">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const runBakeoff = async () => {
    setRunning(true);
    setRows([]);
    try {
      const cardIds = cardIdsText
        .split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("id-bakeoff", {
        body: { action: "run", limit, cardIds: cardIds.length ? cardIds : undefined },
      });
      if (error) throw error;
      const results: Row[] = data?.results ?? [];
      setRows(results);
      const seed: Record<string, IdResult> = {};
      for (const r of results) {
        seed[r.cardId] = {
          card_name: r.truth?.card_name ?? "",
          card_number: r.truth?.card_number ?? "",
          card_set: r.truth?.card_set ?? "",
          card_year: r.truth?.card_year ?? "",
          variant: r.truth?.variant ?? "",
          rarity: r.truth?.rarity ?? "",
        };
      }
      setDrafts(seed);
    } catch (err: any) {
      toast.error(err.message ?? "Bake-off failed");
    } finally {
      setRunning(false);
    }
  };

  const saveTruth = async (cardId: string) => {
    const truth = drafts[cardId];
    if (!truth) return;
    const { error } = await supabase.functions.invoke("id-bakeoff", {
      body: { action: "save_truth", cardId, truth },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Truth saved");
    setRows((prev) => prev.map((r) => r.cardId === cardId ? { ...r, truth: { ...truth, card_id: cardId } } : r));
  };

  const summary = useMemo(() => {
    const scored = rows.filter((r) => r.truth && SCORED_FIELDS.some((f) => norm((r.truth as any)?.[f])));
    const models = [
      { key: "claude", label: "Claude (current)", getter: (r: Row) => r.claude, latency: null as number[] | null },
      { key: "gemini_flash", label: "Gemini 3.5 Flash", getter: (r: Row) => r.gemini_flash?.result, latency: [] as number[] },
      { key: "gemini_pro", label: "Gemini 3.1 Pro", getter: (r: Row) => r.gemini_pro?.result, latency: [] as number[] },
    ];
    return models.map((m) => {
      let overall = 0, total = 0, num = 0, numTotal = 0, vari = 0, variTotal = 0;
      const lat: number[] = [];
      for (const r of scored) {
        const res: any = m.getter(r);
        const truth: any = r.truth;
        for (const f of SCORED_FIELDS) {
          if (norm(truth?.[f])) {
            total++;
            if (match(res?.[f], truth?.[f])) overall++;
          }
        }
        if (norm(truth?.card_number)) { numTotal++; if (match(res?.card_number, truth?.card_number)) num++; }
        if (norm(truth?.variant)) { variTotal++; if (match(res?.variant, truth?.variant)) vari++; }
      }
      if (m.key === "gemini_flash") for (const r of rows) if (r.gemini_flash?.latency_ms) lat.push(r.gemini_flash.latency_ms);
      if (m.key === "gemini_pro") for (const r of rows) if (r.gemini_pro?.latency_ms) lat.push(r.gemini_pro.latency_ms);
      const avgLat = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
      return {
        label: m.label,
        overall: total ? Math.round((overall / total) * 100) : null,
        num: numTotal ? Math.round((num / numTotal) * 100) : null,
        vari: variTotal ? Math.round((vari / variTotal) * 100) : null,
        avgLat,
        scoredCount: scored.length,
      };
    });
  }, [rows]);

  const renderCell = (modelResult: IdResult | null | undefined, truth: IdResult | null, field: keyof IdResult) => {
    const v = (modelResult as any)?.[field];
    const t = truth ? (truth as any)?.[field] : null;
    const hasTruth = !!norm(t);
    const ok = hasTruth && match(v, t);
    const cls = hasTruth ? (ok ? "text-green-600" : "text-red-600") : "";
    return <div className={cls}>{v ?? <span className="text-muted-foreground">—</span>}</div>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Identification Bake-Off</h1>
          <p className="text-muted-foreground">Compare card identification across models. Admin-only. No credits deducted.</p>
        </div>
        <Link to="/admin" className="text-sm underline">← Back to Admin</Link>
      </div>

      <div className="border rounded-lg p-4 space-y-4 bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Run on most recent N cards</Label>
            <Input type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </div>
          <div>
            <Label>Or specific card IDs (comma/space-separated)</Label>
            <Textarea rows={2} value={cardIdsText} onChange={(e) => setCardIdsText(e.target.value)} placeholder="uuid1, uuid2, ..." />
          </div>
        </div>
        <Button onClick={runBakeoff} disabled={running}>
          {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running…</> : "Run Bake-Off"}
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="border rounded-lg p-4 bg-card">
          <h2 className="font-semibold mb-2">Summary ({summary[0]?.scoredCount ?? 0} scored)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {summary.map((s) => (
              <div key={s.label} className="border rounded p-3">
                <div className="font-medium">{s.label}</div>
                <div className="text-sm text-muted-foreground space-y-1 mt-1">
                  <div>Overall: <Badge variant="secondary">{s.overall ?? "—"}{s.overall != null ? "%" : ""}</Badge></div>
                  <div>Card #: <Badge variant="secondary">{s.num ?? "—"}{s.num != null ? "%" : ""}</Badge></div>
                  <div>Variant: <Badge variant="secondary">{s.vari ?? "—"}{s.vari != null ? "%" : ""}</Badge></div>
                  {s.avgLat != null && <div>Avg latency: <Badge>{s.avgLat}ms</Badge></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border rounded-lg overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead>Claude (current)</TableHead>
                <TableHead>Gemini 3.5 Flash</TableHead>
                <TableHead>Gemini 3.1 Pro</TableHead>
                <TableHead className="min-w-[260px]">Verified Truth</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.cardId}>
                  <TableCell className="align-top">
                    {r.image_url && <img src={r.image_url} alt="card" className="w-16 h-auto rounded mb-1" />}
                    <div className="text-xs text-muted-foreground break-all">{r.cardId.slice(0, 8)}…</div>
                    {r.error && <div className="text-xs text-red-600">{r.error}</div>}
                  </TableCell>
                  {(["claude", "gemini_flash", "gemini_pro"] as const).map((key) => {
                    const modelRes = key === "claude" ? r.claude : (r as any)[key]?.result;
                    const err = key === "claude" ? null : (r as any)[key]?.error;
                    const lat = key === "claude" ? null : (r as any)[key]?.latency_ms;
                    return (
                      <TableCell key={key} className="align-top text-sm">
                        {err && <div className="text-xs text-red-600 mb-1">{err}</div>}
                        <div><span className="text-muted-foreground text-xs">Name:</span> {renderCell(modelRes, r.truth, "card_name")}</div>
                        <div><span className="text-muted-foreground text-xs">#:</span> {renderCell(modelRes, r.truth, "card_number")}</div>
                        <div><span className="text-muted-foreground text-xs">Variant:</span> {renderCell(modelRes, r.truth, "variant")}</div>
                        <div><span className="text-muted-foreground text-xs">Set:</span> {renderCell(modelRes, r.truth, "card_set")}</div>
                        <div><span className="text-muted-foreground text-xs">Year:</span> {renderCell(modelRes, r.truth, "card_year")}</div>
                        {lat != null && <Badge variant="outline" className="mt-1">{lat}ms</Badge>}
                      </TableCell>
                    );
                  })}
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      {TRUTH_FIELDS.map((f) => (
                        <Input
                          key={f}
                          placeholder={f}
                          value={(drafts[r.cardId]?.[f] as string) ?? ""}
                          onChange={(e) => setDrafts((p) => ({ ...p, [r.cardId]: { ...p[r.cardId], [f]: e.target.value } }))}
                          className="h-7 text-xs"
                        />
                      ))}
                      <Button size="sm" onClick={() => saveTruth(r.cardId)} className="w-full">Save Truth</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
