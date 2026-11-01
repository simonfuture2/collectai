import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, FlaskConical, Loader2, Play, Square, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import {
  LAB_GAMES, MAIN_TCGS, PRICE_MEDIAN_TARGET_MS, TOP3_TARGET_PCT, goNoGo, parseLabels, rankOf, summarize, toCsv,
  type LabItem, type LabMode, type LabResult,
} from "@/lib/priceCheckLab";

const db = supabase as any;
const sec = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(2)} s`);
const pctTxt = (v: number | null) => (v == null ? "—" : `${v}%`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PriceCheckLab() {
  const { isAdmin, loading } = useAdmin();
  const [items, setItems] = useState<LabItem[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [labels, setLabels] = useState("");
  const [defaultGame, setDefaultGame] = useState<string>("pokemon");
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [cost, setCost] = useState({ price: "0.002", full: "0.05" });
  const stop = useRef(false);

  const load = useCallback(async () => {
    const { data: it } = await db.from("price_check_lab_items").select("*").order("created_at");
    setItems(it ?? []);
    const { data: last } = await db.from("price_check_lab_results").select("run_id").order("created_at", { ascending: false }).limit(1);
    const rid = last?.[0]?.run_id ?? null;
    setRunId(rid);
    if (rid) {
      const { data: rs } = await db.from("price_check_lab_results").select("*").eq("run_id", rid);
      setResults(rs ?? []);
    } else setResults([]);
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const map = parseLabels(labels);
    const rows: any[] = [];
    let missing = 0;
    setUploading(true);
    for (const f of Array.from(files)) {
      const lab = map.get(f.name.toLowerCase());
      if (!lab) { missing++; continue; }
      const path = `${user.id}/lab/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("card-images").upload(path, f, { contentType: f.type || "image/jpeg" });
      if (error) { toast.error(`${f.name}: ${error.message}`); continue; }
      rows.push({ created_by: user.id, image_path: path, file_name: f.name, game: lab.game && (LAB_GAMES as readonly string[]).includes(lab.game) ? lab.game : defaultGame,
        expected_product_id: lab.productId, is_slab: !!lab.slab, is_japanese: !!lab.japanese });
    }
    if (rows.length) {
      const { error } = await db.from("price_check_lab_items").insert(rows);
      if (error) toast.error(error.message);
    }
    setUploading(false);
    toast.success(`Added ${rows.length} photos${missing ? ` · ${missing} skipped (no product ID in the list)` : ""}`);
    load();
  };

  const updateItem = async (id: string, patch: Partial<LabItem>) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await db.from("price_check_lab_items").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };
  const removeItem = async (it: LabItem) => {
    await supabase.storage.from("card-images").remove([it.image_path]);
    await db.from("price_check_lab_items").delete().eq("id", it.id);
    load();
  };

  const callsTotal = async () => Number((await db.rpc("lab_pc_calls_total")).data ?? 0);

  const runPrice = async (it: LabItem): Promise<Omit<LabResult, "item_id" | "mode">> => {
    const t0 = performance.now();
    const { data, error } = await supabase.functions.invoke("price-check", { body: { imagePath: it.image_path, lab: true } });
    const latency = Math.round(performance.now() - t0);
    const err = error ? ((await (error as any).context?.json?.().catch(() => null))?.error ?? error.message) : data?.error;
    if (err) return { latency_ms: latency, rank: null, top_product_id: null, no_match: false, api_calls: 0, error: String(err) };
    const ids = (data?.candidates ?? []).map((c: any) => c.productId);
    return { latency_ms: latency, rank: rankOf(it.expected_product_id, ids), top_product_id: ids[0] ?? null, no_match: ids.length === 0, api_calls: 0, error: null };
  };

  const runFull = async (it: LabItem): Promise<Omit<LabResult, "item_id" | "mode">> => {
    const t0 = performance.now();
    const { data: signed } = await supabase.storage.from("card-images").createSignedUrl(it.image_path, 900);
    const { data, error } = await supabase.functions.invoke("identify-card", {
      body: { imageUrl: signed?.signedUrl, filePath: it.image_path, scanPurpose: "insight", itemType: it.is_slab ? "slab" : "card", lab: true },
    });
    const fail = (e: string) => ({ latency_ms: Math.round(performance.now() - t0), rank: null, top_product_id: null, no_match: false, api_calls: 0, error: e });
    if (error || !data?.cardId) return fail(data?.error ?? error?.message ?? "No card created");
    let card: any = null;
    while (performance.now() - t0 < 240_000 && !stop.current) {
      await sleep(1500);
      const { data: c } = await supabase.from("cards").select("analysis_status, analysis_error, pricecharting_id").eq("id", data.cardId).maybeSingle();
      if (c && (c.analysis_status === "complete" || c.analysis_status === "failed")) { card = c; break; }
    }
    const latency = Math.round(performance.now() - t0);
    await supabase.from("cards").delete().eq("id", data.cardId); // lab scans never stay in the collection
    if (!card) return fail("Timed out");
    if (card.analysis_status === "failed") return { ...fail(card.analysis_error || "Analysis failed"), latency_ms: latency };
    const pc = card.pricecharting_id != null ? Number(card.pricecharting_id) : null;
    return { latency_ms: latency, rank: pc === Number(it.expected_product_id) ? 1 : null, top_product_id: pc, no_match: pc == null, api_calls: 0, error: null };
  };

  const run = async (modes: LabMode[]) => {
    if (!items.length) return;
    stop.current = false;
    const rid = crypto.randomUUID();
    setRunId(rid); setResults([]);
    for (const mode of modes) {
      for (let i = 0; i < items.length && !stop.current; i++) {
        const it = items[i];
        setRunning(`${mode === "price" ? "Price Check" : "Full scan"} ${i + 1}/${items.length}`);
        const before = await callsTotal();
        const r = await (mode === "price" ? runPrice(it) : runFull(it)).catch((e) => ({ latency_ms: null, rank: null, top_product_id: null, no_match: false, api_calls: 0, error: String(e?.message ?? e) }));
        const row: LabResult = { ...r, api_calls: Math.max(0, (await callsTotal()) - before), item_id: it.id, mode };
        setResults((xs) => [...xs, row]);
        await db.from("price_check_lab_results").insert({ ...row, run_id: rid });
      }
    }
    setRunning(null);
  };

  const priceRes = useMemo(() => results.filter((r) => r.mode === "price"), [results]);
  const fullRes = useMemo(() => results.filter((r) => r.mode === "full"), [results]);
  const verdict = useMemo(() => goNoGo(items, priceRes), [items, priceRes]);
  const byItem = useMemo(() => {
    const m = new Map<string, Partial<Record<LabMode, LabResult>>>();
    for (const r of results) m.set(r.item_id, { ...(m.get(r.item_id) ?? {}), [r.mode]: r });
    return m;
  }, [results]);
  const gameRows = useMemo(() => LAB_GAMES.map((g) => {
    const ids = new Set(items.filter((i) => i.game === g).map((i) => i.id));
    return { g, n: ids.size, s: summarize(priceRes.filter((r) => ids.has(r.item_id)), 0) };
  }).filter((x) => x.n > 0), [items, priceRes]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(items, results)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `price-check-lab-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const counts = LAB_GAMES.map((g) => [g, items.filter((i) => i.game === g).length] as const).filter(([, n]) => n);
  const Summary = ({ title, rs, c }: { title: string; rs: LabResult[]; c: number }) => {
    const s = summarize(rs, c);
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{title} <span className="text-muted-foreground font-normal">· {s.count} run{s.errors ? `, ${s.errors} errors` : ""}</span></CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[["Median time", sec(s.medianMs)], ["90th percentile", sec(s.p90Ms)], ["Correct at #1", pctTxt(s.top1Pct)], ["In top 3", pctTxt(s.top3Pct)],
            ["No match", pctTxt(s.noMatchPct)], ["Live PriceCharting calls", String(s.apiCalls)], ["Est. cost / scan", `$${c.toFixed(3)}`], ["Est. total", `$${(c * s.count).toFixed(2)}`]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>
          ))}
        </CardContent>
      </Card>
    );
  };
  const flag = (ok: boolean | null) => ok == null ? <Badge variant="outline">Not run</Badge> : ok ? <Badge className="bg-primary text-primary-foreground">Pass</Badge> : <Badge variant="destructive">Fail</Badge>;

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Price Check Lab | MyCollectAI" description="Admin test bench" path="/admin/price-check-lab" noIndex />
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/admin"><Button variant="ghost" size="icon" aria-label="Back to admin"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <FlaskConical className="w-5 h-5 text-primary" /><h1 className="text-xl font-display font-bold">Price Check Lab</h1>
      </header>
      <main className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">1. Test photos ({items.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Paste one line per photo: <span className="font-mono">file name, PriceCharting product ID, game, slab (yes/no), Japanese (yes/no)</span>. Then choose the photos. Games: {LAB_GAMES.join(", ")}.</p>
            <Textarea rows={4} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder={"charizard.jpg, 627301, pokemon, no, no\nluffy-psa10.jpg, 4112233, one-piece, yes, yes"} />
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1"><Label>Game when not listed</Label>
                <Select value={defaultGame} onValueChange={setDefaultGame}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{LAB_GAMES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
              <Button asChild variant="outline" disabled={uploading}>
                <label className="cursor-pointer">{uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}Choose photos
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></label>
              </Button>
              <div className="flex flex-wrap gap-1">{counts.map(([g, n]) => <Badge key={g} variant="secondary">{g} {n}</Badge>)}
                <Badge variant="secondary">slabs {items.filter((i) => i.is_slab).length}</Badge><Badge variant="secondary">Japanese {items.filter((i) => i.is_japanese).length}</Badge></div>
            </div>
            {items.length > 0 && items.length < 50 && <p className="text-xs text-muted-foreground">Aim for 50+ photos for a reliable result.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">2. Run</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3 text-sm">
            <div className="space-y-1"><Label>Est. cost per Price Check ($)</Label><Input className="w-32" value={cost.price} onChange={(e) => setCost({ ...cost, price: e.target.value })} /></div>
            <div className="space-y-1"><Label>Est. cost per full scan ($)</Label><Input className="w-32" value={cost.full} onChange={(e) => setCost({ ...cost, full: e.target.value })} /></div>
            {running ? (
              <><Button variant="outline" onClick={() => { stop.current = true; }}><Square className="w-4 h-4 mr-2" />Stop</Button>
                <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{running}</span></>
            ) : (
              <><Button onClick={() => run(["price", "full"])} disabled={!items.length}><Play className="w-4 h-4 mr-2" />Run both</Button>
                <Button variant="outline" onClick={() => run(["price"])} disabled={!items.length}>Price Check only</Button>
                <Button variant="outline" onClick={() => run(["full"])} disabled={!items.length}>Full scan only</Button></>
            )}
            <Button variant="ghost" onClick={exportCsv} disabled={!results.length}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
            <p className="w-full text-xs text-muted-foreground">Lab runs cost no credits, skip per-user limits and are not counted in match accuracy. Full-scan test cards are deleted after each run. Costs are your estimates; live call counts include any other users' lookups made at the same moment.</p>
          </CardContent>
        </Card>

        {runId && (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">Go / no-go {verdict.go == null ? <Badge variant="outline">Not enough data</Badge> : verdict.go ? <Badge className="bg-primary text-primary-foreground">GO</Badge> : <Badge variant="destructive">NO-GO</Badge>}</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="flex items-center gap-2">{flag(verdict.speedOk)} Price Check median under {PRICE_MEDIAN_TARGET_MS / 1000} s ({sec(summarize(priceRes, 0).medianMs)})</p>
                <p className="flex items-center gap-2">{flag(verdict.accuracyOk)} Correct card in top 3 at least {TOP3_TARGET_PCT}% for {MAIN_TCGS.join(", ")} ({pctTxt(verdict.mainTop3Pct)})</p>
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Summary title="Price Check" rs={priceRes} c={Number(cost.price) || 0} />
              <Summary title="Full scan" rs={fullRes} c={Number(cost.full) || 0} />
            </div>
            {gameRows.length > 0 && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-base">Price Check by game</CardTitle></CardHeader>
                <CardContent><Table><TableHeader><TableRow><TableHead>Game</TableHead><TableHead>Photos</TableHead><TableHead>Median</TableHead><TableHead>#1</TableHead><TableHead>Top 3</TableHead><TableHead>No match</TableHead></TableRow></TableHeader>
                  <TableBody>{gameRows.map(({ g, n, s }) => <TableRow key={g}><TableCell>{g}</TableCell><TableCell>{n}</TableCell><TableCell>{sec(s.medianMs)}</TableCell><TableCell>{pctTxt(s.top1Pct)}</TableCell><TableCell>{pctTxt(s.top3Pct)}</TableCell><TableCell>{pctTxt(s.noMatchPct)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            )}
          </>
        )}

        {items.length > 0 && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Photos and results</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Photo</TableHead><TableHead>Game</TableHead><TableHead>Product ID</TableHead><TableHead>Slab</TableHead><TableHead>Japanese</TableHead><TableHead>Price Check</TableHead><TableHead>Full scan</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{items.map((it) => {
                const r = byItem.get(it.id) ?? {};
                const cell = (x?: LabResult) => !x ? "—" : x.error ? <span className="text-destructive text-xs">{x.error.slice(0, 60)}</span>
                  : <span className="text-xs tabular-nums">{sec(x.latency_ms)} · {x.rank ? `#${x.rank}` : x.no_match ? "no match" : "missed"}</span>;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="max-w-[180px] truncate text-xs">{it.file_name}</TableCell>
                    <TableCell><Select value={it.game} onValueChange={(g) => updateItem(it.id, { game: g })}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>{LAB_GAMES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></TableCell>
                    <TableCell><Input className="h-8 w-28" defaultValue={it.expected_product_id} onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n !== it.expected_product_id) updateItem(it.id, { expected_product_id: n }); }} /></TableCell>
                    <TableCell><Checkbox checked={it.is_slab} onCheckedChange={(v) => updateItem(it.id, { is_slab: !!v })} aria-label="Slab" /></TableCell>
                    <TableCell><Checkbox checked={it.is_japanese} onCheckedChange={(v) => updateItem(it.id, { is_japanese: !!v })} aria-label="Japanese" /></TableCell>
                    <TableCell>{cell(r.price)}</TableCell><TableCell>{cell(r.full)}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" aria-label="Remove photo" disabled={!!running} onClick={() => removeItem(it)}><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table></CardContent></Card>
        )}
      </main>
    </div>
  );
}
