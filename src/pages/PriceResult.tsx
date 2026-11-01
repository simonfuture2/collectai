import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Camera, ChevronDown, ExternalLink, Loader2, Plus, Search, Sparkles } from "lucide-react";
import SEO from "@/components/SEO";
import UpgradeModal from "@/components/UpgradeModal";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/use-credits";
import { cn } from "@/lib/utils";
import { packSummary, priceOnlyCard, storedPulls, type PackPull, type PriceCandidate } from "@/lib/packRip";
import { gradedChips, ladderRows, parallelOf, ungradedPrice } from "@/lib/priceLadder";

type Reading = { name?: string; number?: string; set?: string; year?: string };
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

const PriceResult = () => {
  const { priceCheckId } = useParams();
  const [params] = useSearchParams();
  const ripId = params.get("rip");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { credits, refresh: refreshCredits } = useCredits();
  const backUrl = ripId ? `/pack-rip?rip=${ripId}` : "/scan?mode=price";

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<PriceCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string>("");
  const [reading, setReading] = useState<Reading>({});
  const [category, setCategory] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"add" | "full" | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PriceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const saveSeq = useRef(0);

  useEffect(() => {
    (async () => {
      if (!priceCheckId) { setLoading(false); return; }
      const { data } = await supabase.from("price_checks")
        .select("candidates, selected_product_id, image_path, identification, added_card_id").eq("id", priceCheckId).maybeSingle();
      const list = ((data?.candidates as unknown) as PriceCandidate[]) ?? [];
      const ident = (data?.identification ?? {}) as { best?: Reading; category?: string };
      setCandidates(list);
      setReading(ident.best ?? {});
      setCategory(ident.category ?? null);
      setCardId(data?.added_card_id ?? null);
      let sel = data?.selected_product_id ?? list[0]?.productId ?? null;
      if (ripId) {
        const { data: rip } = await supabase.from("pack_rips").select("pulls").eq("id", ripId).maybeSingle();
        const pull = (rip?.pulls as unknown as PackPull[] | undefined)?.find(p => p.priceCheckId === priceCheckId);
        sel = pull?.selected?.productId ?? sel;
        if (pull?.cardId) setCardId(pull.cardId);
      }
      setSelectedId(sel);
      if (data?.image_path) {
        setImagePath(data.image_path);
        const { data: signed } = await supabase.storage.from("card-images").createSignedUrl(data.image_path, 3600);
        setPhoto(signed?.signedUrl ?? null);
      }
      setLoading(false);
    })();
  }, [priceCheckId, ripId]);

  const c = candidates.find(o => o.productId === selectedId) ?? null;

  const syncRip = async (selected: PriceCandidate) => {
    if (!ripId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: rip } = await supabase.from("pack_rips").select("pulls").eq("id", ripId).eq("user_id", user.id).single();
    const pulls = (rip?.pulls as unknown as PackPull[]) ?? [];
    const original = pulls.find(p => p.priceCheckId === priceCheckId);
    if (!original) return;
    const next = pulls.map(p => p.priceCheckId === priceCheckId ? { ...p, selected, cardName: selected.name, cardSet: selected.set } : p);
    await supabase.from("pack_rips").update({ pulls: storedPulls(next), ...packSummary(next) }).eq("id", ripId).eq("user_id", user.id);
  };

  const choose = async (o: PriceCandidate) => {
    if (o.productId === selectedId) return;
    setSelectedId(o.productId); setExpanded(false);
    if (!candidates.some(x => x.productId === o.productId)) setCandidates(prev => [...prev, o]);
    const seq = ++saveSeq.current;
    try {
      const { data, error } = await supabase.functions.invoke("price-check", { body: { action: "select", priceCheckId, productId: o.productId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (seq !== saveSeq.current) return;
      if (cardId) {
        await supabase.from("cards").update({ card_name: o.name, card_set: o.set, pricecharting_id: o.productId, pc_prices: o.ladder, estimated_value_low: o.ladder.ungraded ?? null, estimated_value_high: o.ladder.ungraded ?? null })
          .eq("id", cardId).eq("analysis_depth", "price_only");
      }
      await syncRip(o);
    } catch (e) { toast({ title: "Could not save your choice", description: errMsg(e), variant: "destructive" }); }
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("price-check", { body: { action: "search", query: query.trim() } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setResults(data.candidates ?? []);
    } catch (e) { toast({ title: "Search failed", description: errMsg(e), variant: "destructive" }); }
    finally { setSearching(false); }
  };

  const ensureCard = async () => {
    if (cardId) return cardId;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Please sign in.");
    const id = crypto.randomUUID();
    const pull: PackPull = { priceCheckId: priceCheckId!, cardName: c?.name || reading.name || "Unidentified card", cardSet: c?.set ?? reading.set ?? null, selected: c, imagePath, category, year: reading.year ?? null };
    const { error } = await supabase.from("cards").insert(priceOnlyCard(pull, user.id, id));
    if (error) throw error;
    await supabase.functions.invoke("price-check", { body: { action: "link", priceCheckId, cardId: id } });
    setCardId(id);
    return id;
  };

  const addToCollection = async () => {
    setBusy("add");
    try { await ensureCard(); toast({ title: "Added to your collection", description: "Free · price-only card" }); }
    catch (e) { toast({ title: "Could not add card", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const fullAnalysis = async () => {
    if (credits < 1) { setShowUpgrade(true); return; }
    setBusy("full");
    try {
      const id = await ensureCard();
      const { data, error } = await supabase.functions.invoke("reanalyze-card", { body: { cardId: id, priceOnlyUpgrade: true } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      refreshCredits();
      toast({ title: "Full analysis started" });
      navigate(`/card/${id}`);
    } catch (e) { toast({ title: "Analysis could not start", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const raw = ungradedPrice(c?.ladder);
  const chips = gradedChips(c?.ladder);
  const rows = ladderRows(c?.ladder);
  const title = c?.name ?? reading.name ?? "Unidentified card";
  const subtitle = [c?.set ?? reading.set, (c?.number ?? reading.number) ? `#${c?.number ?? reading.number}` : null].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-background pb-[calc(19rem+env(safe-area-inset-bottom))]">
      <SEO title="Price Check | MyCollectAI" description="PriceCharting value for your card." path="/price" noIndex />
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-md px-3 py-2 flex items-center gap-2">
          <Link to={backUrl}><Button variant="ghost" size="icon" aria-label={ripId ? "Back to pack" : "Back to scan"}><ArrowLeft className="w-5 h-5" /></Button></Link>
          <span className="font-display text-lg font-semibold">Price check</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-4 space-y-5">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <section className="flex gap-4 items-start">
              <div className="w-28 shrink-0 aspect-[3/4] rounded-2xl overflow-hidden bg-muted border border-border">
                {photo && <img src={photo} alt="Your card photo" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 pt-1">
                <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
                {c && parallelOf(c.name) && <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{parallelOf(c.name)}</span>}
              </div>
            </section>

            {!c ? (
              <section className="rounded-3xl border border-border bg-card p-6 text-center space-y-4">
                <h2 className="font-display text-xl font-semibold">No PriceCharting match</h2>
                <p className="text-sm text-muted-foreground">We couldn't find this card in PriceCharting, so we're not showing a price.</p>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={() => setSearchOpen(true)}><Search className="mr-2 w-4 h-4" />Search</Button>
                  <Button disabled={!!busy} onClick={fullAnalysis}>
                    {busy === "full" ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Sparkles className="mr-2 w-4 h-4" />}Run full analysis · 1 credit
                  </Button>
                </div>
              </section>
            ) : (
              <>
                <section className="rounded-3xl bg-primary p-5 text-primary-foreground shadow-lg">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-90">Ungraded · PriceCharting</p>
                  <p className="mt-1 font-display text-5xl font-bold tabular-nums">{raw != null ? usd(raw) : "—"}</p>
                  {raw == null && <p className="mt-1 text-sm opacity-90">No ungraded price listed.</p>}
                </section>

                {chips.length > 0 && (
                  <section>
                    <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="w-full text-left">
                      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
                        {chips.map(ch => (
                          <span key={ch.key} className="shrink-0 rounded-2xl border border-border bg-card px-3 py-2">
                            <span className="block text-[11px] font-medium text-muted-foreground">{ch.label}</span>
                            <span className="block font-semibold tabular-nums text-foreground">{usd(ch.value)}</span>
                          </span>
                        ))}
                      </div>
                      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                        {expanded ? "Hide" : "Show"} all grades <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
                      </span>
                    </button>
                    {expanded && (
                      <dl className="mt-2 rounded-2xl border border-border bg-card divide-y divide-border">
                        {rows.map(r => (
                          <div key={r.key} className="flex justify-between px-4 py-2 text-sm">
                            <dt className="text-muted-foreground">{r.label}</dt>
                            <dd className="font-semibold tabular-nums text-foreground">{usd(r.value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                )}

                <section className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Prices from PriceCharting</p>
                  <Button asChild variant="outline" size="sm">
                    <a href={c.url} target="_blank" rel="noopener noreferrer">View on PriceCharting <ExternalLink className="ml-1 w-3.5 h-3.5" /></a>
                  </Button>
                </section>
              </>
            )}
          </>
        )}
      </main>

      {!loading && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-md">
            {candidates.length > 0 && (
              <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory px-4 pt-3 pb-1 scrollbar-none" aria-label="Possible matches">
                {candidates.map(o => {
                  const p = ungradedPrice(o.ladder);
                  const on = o.productId === selectedId;
                  return (
                    <button key={o.productId} type="button" onClick={() => choose(o)} aria-pressed={on}
                      className={cn("snap-start shrink-0 w-[140px] rounded-2xl border-2 bg-card p-2.5 text-left transition-colors",
                        on ? "border-primary bg-primary/5" : "border-border")}>
                      <span className="block text-sm font-semibold leading-tight text-foreground line-clamp-2">{o.name.replace(/\s*\[[^\]]+\]/, "")}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground truncate">{[o.set, o.number && `#${o.number}`].filter(Boolean).join(" · ")}</span>
                      {parallelOf(o.name) && <span className="block text-[11px] text-primary truncate">{parallelOf(o.name)}</span>}
                      <span className="mt-1 block font-semibold tabular-nums text-foreground">{p != null ? usd(p) : "—"}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="px-4 pt-1">
              <button type="button" onClick={() => setSearchOpen(true)} className="text-xs font-medium text-primary inline-flex items-center gap-1">
                <Search className="w-3.5 h-3.5" />Not right? Search
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 py-3">
              <Button asChild variant="outline" className="h-auto py-2.5 flex-col gap-1 text-xs">
                <Link to={backUrl}><Camera className="w-4 h-4" />{ripId ? "Back to pack" : "Scan next"}</Link>
              </Button>
              <Button variant="outline" className="h-auto py-2.5 flex-col gap-1 text-xs whitespace-normal" disabled={!!busy || !!cardId} onClick={addToCollection}>
                {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{cardId ? "In collection" : "Add to collection (free)"}
              </Button>
              <Button className="h-auto py-2.5 flex-col gap-1 text-xs whitespace-normal" disabled={!!busy} onClick={fullAnalysis}>
                {busy === "full" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Full analysis · 1 credit
              </Button>
            </div>
          </div>
        </div>
      )}

      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader><SheetTitle className="font-display">Search PriceCharting</SheetTitle></SheetHeader>
          <form onSubmit={runSearch} className="mt-3 flex gap-2">
            <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Card name and number, e.g. Charizard 4" />
            <Button type="submit" disabled={searching}>{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}</Button>
          </form>
          <div className="mt-3 space-y-2">
            {results.map(o => {
              const p = ungradedPrice(o.ladder);
              return (
                <button key={o.productId} type="button" onClick={() => { choose(o); setSearchOpen(false); }}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left">
                  <span className="min-w-0"><span className="block text-sm font-medium truncate">{o.name}</span><span className="block text-xs text-muted-foreground truncate">{o.set}</span></span>
                  <span className="font-semibold tabular-nums">{p != null ? usd(p) : "—"}</span>
                </button>
              );
            })}
            {!searching && results.length === 0 && query && <p className="text-sm text-muted-foreground">Search to see matches from the stored list.</p>}
          </div>
        </SheetContent>
      </Sheet>
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} feature="Full analysis" />
    </div>
  );
};

export default PriceResult;
