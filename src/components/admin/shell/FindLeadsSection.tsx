import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin, Search, Upload, Youtube, Sparkles, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callFn, parseCsv } from "./leadgenClient";

interface Hit { place_id: string; name: string; address: string; website: string | null; city: string | null; state: string | null; miles: number; matched: string[]; lead_id: string | null }

function ShopsTab() {
  const [location, setLocation] = useState("Bel Air, MD");
  const [miles, setMiles] = useState(25);
  const [terms, setTerms] = useState<string[]>([]);
  const [termText, setTermText] = useState("");
  const [states, setStates] = useState<Record<string, string[]>>({});
  const [state, setState] = useState("MD");
  const [est, setEst] = useState<{ searches: number; usd: number; cap: number; usedToday: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState("");

  useEffect(() => { callFn("places-search", { action: "states" }).then((d) => { setStates(d.states); setTerms(d.terms); setTermText(d.terms.join(", ")); }).catch(() => {}); }, []);
  const termList = useMemo(() => termText.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10), [termText]);
  useEffect(() => { if (termList.length) callFn("places-search", { action: "estimate", terms: termList }).then(setEst).catch(() => {}); }, [termList]);

  const run = async (whole: boolean) => {
    const e = await callFn("places-search", { action: "estimate", terms: termList, ...(whole ? { state } : {}) });
    if (!confirm(`This runs about ${e.searches} Google searches (≈ $${e.usd}). ${e.usedToday}/${e.cap} used today. Go ahead?`)) return;
    setBusy(true); setHits([]); setPick(new Set());
    try {
      const d = await callFn("places-search", whole ? { action: "search_state", state, miles: 15, terms: termList } : { action: "search", location, miles, terms: termList });
      setHits(d.hits); setPick(new Set(d.hits.filter((h: Hit) => !h.lead_id).map((h: Hit) => h.place_id)));
      setInfo(`${d.hits.length} places · ${d.searches} searches${d.capped ? " · stopped at today's cap" : ""}`);
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const doImport = async () => {
    const rows = hits.filter((h) => pick.has(h.place_id) && !h.lead_id);
    if (!rows.length) return;
    setBusy(true);
    try {
      const r = await callFn("places-search", { action: "import", places: rows });
      toast.success(`Imported ${r.imported.length}. Their websites are being read now.`);
      const ids = new Set(rows.map((x) => x.place_id));
      setHits((h) => h.map((x) => (ids.has(x.place_id) ? { ...x, lead_id: "new" } : x))); setPick(new Set());
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="pt-6 grid gap-3 md:grid-cols-[1fr_120px_auto]">
        <div><Label>City or ZIP</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
        <div><Label>Miles (5–30)</Label><Input type="number" min={5} max={30} value={miles} onChange={(e) => setMiles(Math.max(5, Math.min(30, Number(e.target.value) || 25)))} /></div>
        <div className="flex items-end"><Button onClick={() => run(false)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}Search</Button></div>
        <div className="md:col-span-3"><Label>Search terms (comma separated)</Label><Input value={termText} onChange={(e) => setTermText(e.target.value)} /></div>
        <div className="md:col-span-3 flex flex-wrap items-center gap-2">
          <Select value={state} onValueChange={setState}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(states).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => run(true)} disabled={busy}><MapPin className="h-4 w-4 mr-2" />Search a whole state ({states[state]?.length ?? 0} cities)</Button>
          {est && <span className="text-xs text-muted-foreground">One area ≈ {est.searches} searches (≈ ${est.usd}) · {est.usedToday}/{est.cap} used today</span>}
        </div>
      </CardContent></Card>
      {hits.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">{info}</CardTitle>
            <Button onClick={doImport} disabled={busy || pick.size === 0}>Import {pick.size}</Button></CardHeader>
          <CardContent className="divide-y">
            {hits.map((h) => (
              <label key={h.place_id} className="flex items-start gap-3 py-2 text-sm">
                <Checkbox disabled={!!h.lead_id} checked={pick.has(h.place_id)} onCheckedChange={(c) => setPick((s) => { const n = new Set(s); c ? n.add(h.place_id) : n.delete(h.place_id); return n; })} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{h.name} {h.lead_id && <Badge variant="secondary" className="ml-1">Already a lead</Badge>}</div>
                  <div className="text-muted-foreground truncate">{h.address} · {h.miles} mi{h.website ? ` · ${h.website.replace(/^https?:\/\//, "")}` : " · no website"}</div>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const FIELDS = ["name", "handle", "website", "city", "state", "followers", "notes"] as const;
function ListTab() {
  const [platform, setPlatform] = useState("ebay");
  const [leadType, setLeadType] = useState<"seller" | "creator">("seller");
  const [source, setSource] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const header = rows[0] ?? [];
  const load = (text: string, name?: string) => {
    const r = parseCsv(text); setRows(r);
    const m: Record<string, number> = {};
    (r[0] ?? []).forEach((h, i) => { const k = h.toLowerCase().trim(); const f = FIELDS.find((f) => k.includes(f) || (f === "name" && /store|channel|server|shop/.test(k)) || (f === "followers" && /subscriber|member/.test(k))); if (f && m[f] === undefined) m[f] = i; });
    if (m.name === undefined && m.handle === undefined) m.name = 0;
    setMap(m); if (name && !source) setSource(name.replace(/\.csv$/i, "").slice(0, 120));
  };
  const submit = async () => {
    const body = rows.slice(1).map((r) => { const o: any = {}; for (const f of FIELDS) { const i = map[f]; if (i !== undefined && r[i]?.trim()) o[f] = f === "followers" ? Number(r[i].replace(/[^\d]/g, "")) || undefined : r[i].trim(); } return o; }).filter((o) => o.name || o.handle);
    if (!body.length) return toast.error("No rows with a name or handle");
    setBusy(true);
    try { const r = await callFn("lead-import", { action: "rows", platform, lead_type: leadType, source: source || `${platform}_list`, rows: body.slice(0, 500) }); toast.success(`Imported ${r.imported}; ${r.duplicates.length} duplicates skipped`); setRows([]); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card><CardContent className="pt-6 space-y-3">
      <p className="text-sm text-muted-foreground">Store names, handles and websites only. Email columns are ignored — public business emails are found later on their own website or channel.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <div><Label>Platform</Label><Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["ebay", "whatnot", "tcgplayer", "etsy", "youtube", "tiktok", "instagram", "discord", "other"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Type</Label><Select value={leadType} onValueChange={(v) => setLeadType(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="seller">Seller</SelectItem><SelectItem value="creator">Creator</SelectItem></SelectContent></Select></div>
        <div><Label>Source</Label><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. whatnot_pokemon_nov" /></div>
      </div>
      <div className="flex gap-2 items-center">
        <Button variant="outline" asChild><label className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />Upload CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text(), f.name); }} /></label></Button>
        <span className="text-xs text-muted-foreground">or paste below (first line = column names)</span>
      </div>
      <Textarea rows={5} placeholder={"name,handle,website\nBig Pack Hobby,bigpackhobby,https://shopbigpack.com"} onBlur={(e) => e.target.value.trim() && load(e.target.value)} />
      {rows.length > 1 && (<>
        <div className="grid gap-2 md:grid-cols-4">{FIELDS.map((f) => (
          <div key={f}><Label className="text-xs">{f}</Label><Select value={map[f] === undefined ? "-" : String(map[f])} onValueChange={(v) => setMap((m) => { const n = { ...m }; if (v === "-") delete n[f]; else n[f] = Number(v); return n; })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="-">—</SelectItem>{header.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>)}</SelectContent></Select></div>))}
        </div>
        <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Import {rows.length - 1} rows</Button>
      </>)}
    </CardContent></Card>
  );
}

function YouTubeTab() {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any[]>([]);
  const go = async () => {
    const channels = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (!channels.length) return;
    setBusy(true);
    try { const r = await callFn("lead-import", { action: "youtube", channels, source: "youtube_import" }); setRes(r.results); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card><CardContent className="pt-6 space-y-3">
      <Label>YouTube channels (@handle or channel link, one per line, up to 50)</Label>
      <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"@PokeRev\nhttps://www.youtube.com/@Leonhart"} />
      <Button onClick={go} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Youtube className="h-4 w-4 mr-2" />}Import channels</Button>
      {res.length > 0 && <div className="divide-y text-sm">{res.map((r, i) => (
        <div key={i} className="py-1.5 flex justify-between gap-2"><span>{r.name ?? r.input}</span>
          <span className="text-muted-foreground">{r.error ? r.error : r.duplicate ? "Already a lead" : `${(r.subscribers ?? 0).toLocaleString()} subs${r.email ? " · public email" : ""}`}</span></div>))}</div>}
    </CardContent></Card>
  );
}

function EnrichTab() {
  const [counts, setCounts] = useState<Record<string, number>>({}); const [busy, setBusy] = useState(false);
  const load = async () => {
    const out: Record<string, number> = {};
    for (const s of ["pending", "failed", "done"]) { const { count } = await supabase.from("agent_leads").select("id", { count: "exact", head: true }).not("website", "is", null).eq("enrich_status", s); out[s] = count ?? 0; }
    setCounts(out);
  };
  useEffect(() => { load(); }, []);
  return (
    <Card><CardContent className="pt-6 space-y-3">
      <p className="text-sm">Waiting: <b>{counts.pending ?? 0}</b> · Couldn't read (retried up to twice): <b>{counts.failed ?? 0}</b> · Done: <b>{counts.done ?? 0}</b></p>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={async () => { setBusy(true); try { await callFn("enrich-lead", { limit: 50, background: true }); toast.success("Reading up to 50 websites in the background"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setTimeout(load, 4000); } }}><Sparkles className="h-4 w-4 mr-2" />Read next 50 websites</Button>
        <Button variant="outline" disabled={busy} onClick={async () => { if (!confirm("Run the daily lead run now? It searches the next cities, reads websites and enrolls the best fits.")) return; try { await callFn("lead-run", {}); toast.success("Lead run started — the summary shows on Overview when it finishes"); } catch (e) { toast.error((e as Error).message); } }}><Play className="h-4 w-4 mr-2" />Run daily lead run now</Button>
      </div>
    </CardContent></Card>
  );
}

export default function FindLeadsSection() {
  return (
    <Tabs defaultValue="shops">
      <TabsList className="flex-wrap h-auto"><TabsTrigger value="shops">Card shops</TabsTrigger><TabsTrigger value="list">Sellers & creators list</TabsTrigger><TabsTrigger value="youtube">YouTube</TabsTrigger><TabsTrigger value="enrich">Website reading</TabsTrigger></TabsList>
      <TabsContent value="shops"><ShopsTab /></TabsContent>
      <TabsContent value="list"><ListTab /></TabsContent>
      <TabsContent value="youtube"><YouTubeTab /></TabsContent>
      <TabsContent value="enrich"><EnrichTab /></TabsContent>
    </Tabs>
  );
}
