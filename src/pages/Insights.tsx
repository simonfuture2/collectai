import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, MoreHorizontal, ScanSearch, CheckSquare, X, MapPin, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import EmptyState from "@/components/EmptyState";
import { DealChip } from "@/components/DealChip";
import { getSignedImageUrl, deleteCardAndImage } from "@/lib/cardImage";
import { dealVerdict, moveInsightToCollection } from "@/lib/insights";
import { cn } from "@/lib/utils";

const PENDING = ["pending", "identifying", "pricing", "analyzing", "verifying"];
type Filter = "all" | "raw" | "graded" | "sealed";
const isSealedRow = (c: any) => c.item_type === "sealed";
type Sort = "newest" | "value" | "deal";

const isGraded = (c: any) => !!c.grading_company && c.grade_numeric != null;
const mid = (c: any) => {
  const l = Number(c.estimated_value_low || 0), h = Number(c.estimated_value_high || 0);
  return l && h ? (l + h) / 2 : l || h || 0;
};
const dayLabel = (iso: string) => {
  const d = new Date(iso); const t = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(t) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};

const Insights = () => {
  const navigate = useNavigate();
  const [cards, setCards] = useState<any[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { navigate("/auth?next=/insights"); return; }
    const { data } = await supabase
      .from("cards")
      .select("id, card_name, card_set, card_year, condition_grade, grading_company, grade_numeric, estimated_value_low, estimated_value_high, asking_price, insight_event, analysis_status, image_url, created_at, item_type, ai_analysis")
      .eq("user_id", session.user.id)
      .eq("scan_purpose", "insight")
      .order("created_at", { ascending: false });
    setCards(data || []);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  // Poll while anything is still analyzing (cards don't broadcast live changes).
  const anyPending = !!cards?.some((c) => PENDING.includes(c.analysis_status));
  useEffect(() => {
    if (!anyPending) return;
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [anyPending, load]);

  useEffect(() => {
    if (!cards) return;
    const missing = cards.filter((c) => c.image_url && !thumbs[c.id]);
    if (!missing.length) return;
    Promise.all(missing.map(async (c) => [c.id, await getSignedImageUrl(c.image_url)] as const)).then((pairs) =>
      setThumbs((t) => ({ ...t, ...Object.fromEntries(pairs) })),
    );
  }, [cards, thumbs]);

  const visible = useMemo(() => {
    let list = (cards || []).filter((c) => filter === "all" || (filter === "sealed" ? isSealedRow(c) : filter === "graded" ? isGraded(c) : !isGraded(c) && !isSealedRow(c)));
    if (sort === "value") list = [...list].sort((a, b) => mid(b) - mid(a));
    if (sort === "deal") list = [...list].sort((a, b) => {
      const da = dealVerdict(a.asking_price, a.estimated_value_low, a.estimated_value_high)?.diffPct ?? Infinity;
      const db = dealVerdict(b.asking_price, b.estimated_value_low, b.estimated_value_high)?.diffPct ?? Infinity;
      return da - db;
    });
    return list;
  }, [cards, filter, sort]);

  const groups = useMemo(() => {
    const out: { key: string; event: string | null; day: string; items: any[] }[] = [];
    for (const c of visible) {
      const event = c.insight_event?.trim() || null;
      const day = dayLabel(c.created_at);
      const key = `${event ?? ""}|${day}`;
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, event, day, items: [] }; out.push(g); }
      g.items.push(c);
    }
    return out;
  }, [visible]);

  const removeLocal = (ids: string[]) => setCards((cs) => (cs || []).filter((c) => !ids.includes(c.id)));

  const addMany = async (ids: string[]) => {
    const results = await Promise.all(ids.map((id) => moveInsightToCollection(id)));
    const ok = ids.filter((_, i) => !results[i].error);
    removeLocal(ok);
    setSelected(new Set());
    if (ok.length) toast.success(ok.length === 1 ? "Added to your collection" : `${ok.length} cards added to your collection`);
    if (ok.length < ids.length) toast.error("Some cards couldn't be added");
  };

  const deleteMany = async (ids: string[]) => {
    const targets = (cards || []).filter((c) => ids.includes(c.id));
    const results = await Promise.all(targets.map((c) => deleteCardAndImage(c)));
    const ok = targets.filter((_, i) => !results[i].error).map((c) => c.id);
    removeLocal(ok);
    setSelected(new Set());
    if (ok.length) toast.success(ok.length === 1 ? "Insight deleted" : `${ok.length} insights deleted`);
    if (ok.length < ids.length) toast.error("Some insights couldn't be deleted");
  };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Insights – MyCollectAI" description="Your insight scans from shows and shops." path="/insights" noIndex />
      <header className="border-b border-border sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-4 flex items-center gap-2">
          <Link to="/collection"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <h1 className="flex-1 text-base sm:text-xl font-display font-bold text-secondary truncate">Insights</h1>
          {!!cards?.length && (
            <Button variant="ghost" size="sm" onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}>
              {selecting ? <><X className="w-4 h-4 mr-1" />Done</> : <><CheckSquare className="w-4 h-4 mr-1" />Select</>}
            </Button>
          )}
          <ThemeToggle />
        </div>
        <div className="container mx-auto px-3 sm:px-4 pb-2">
          <div className="grid grid-cols-2 rounded-xl bg-muted p-1 max-w-sm">
            <Link to="/collection" className="rounded-lg py-1.5 text-center text-sm font-semibold text-muted-foreground hover:text-foreground">My Collection</Link>
            <span className="rounded-lg py-1.5 text-center text-sm font-semibold bg-secondary text-secondary-foreground">Insights</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 max-w-3xl">
        {cards === null ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={ScanSearch}
            title="No insight scans yet"
            description="Scanning at a show or shop? Insight scans price a card without adding it to your collection."
            action={<Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90" onClick={() => navigate("/scan?mode=insight")}>Start an insight scan</Button>}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex rounded-lg bg-muted p-1">
                {(["all", "raw", "graded", "sealed"] as Filter[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)}
                    className={cn("px-3 py-1 rounded-md text-xs font-semibold capitalize", filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                    {f}
                  </button>
                ))}
              </div>
              <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="value">Highest value</SelectItem>
                  <SelectItem value="deal">Best deal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selecting && (
              <div className="sticky top-[7.5rem] z-10 mb-3 flex items-center gap-2 rounded-xl border border-secondary/30 bg-card p-2">
                <span className="text-xs text-muted-foreground flex-1 pl-1">{selected.size} selected</span>
                <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => addMany([...selected])}>Add to collection</Button>
                <Button size="sm" variant="destructive" disabled={!selected.size} onClick={() => deleteMany([...selected])}>Delete</Button>
              </div>
            )}

            {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No {filter} insights.</p>}

            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.key}>
                  <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.event && <><MapPin className="w-3.5 h-3.5 text-secondary" /><span className="text-foreground normal-case tracking-normal text-sm">{g.event}</span><span>·</span></>}
                    {g.day}
                  </h2>
                  <ul className="space-y-2">
                    {g.items.map((c) => {
                      const pending = PENDING.includes(c.analysis_status);
                      const lo = Number(c.estimated_value_low || 0), hi = Number(c.estimated_value_high || 0);
                      const grade = isGraded(c) ? `${c.grading_company} ${c.grade_numeric}` : c.condition_grade;
                      return (
                        <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
                          {selecting && <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label="Select" />}
                          <button type="button" onClick={() => selecting ? toggle(c.id) : navigate(`/scan/reveal/${c.id}`)} className="flex flex-1 min-w-0 items-center gap-3 text-left">
                            {isSealedRow(c) && !thumbs[c.id] ? (
                              <div className="h-16 w-12 rounded-md border border-border shrink-0 flex items-center justify-center bg-muted"><Package className="w-5 h-5 text-secondary" /></div>
                            ) : thumbs[c.id] ? (
                              <img src={thumbs[c.id]} alt="" className="h-16 w-12 rounded-md object-cover border border-border shrink-0" />
                            ) : <Skeleton className="h-16 w-12 rounded-md shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold truncate">{isSealedRow(c) && <Package className="inline w-3.5 h-3.5 mr-1 text-secondary align-[-2px]" />}{c.card_name || (pending ? "Identifying…" : "Unknown card")}</p>
                              <p className="text-xs text-muted-foreground truncate">{[c.card_set, c.card_year].filter(Boolean).join(" · ") || "—"}{grade ? ` · ${grade}` : ""}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {isSealedRow(c) ? null : pending && !(lo && hi) ? <Skeleton className="h-4 w-20" /> : (
                                  <span className="text-sm font-numeric font-semibold">{lo && hi ? `$${lo.toFixed(0)} – $${hi.toFixed(0)}` : "—"}</span>
                                )}
                                {isSealedRow(c) && c.ai_analysis?.sealedPrice != null && (
                                  <span className="text-sm font-numeric font-semibold">${Number(c.ai_analysis.sealedPrice).toFixed(2)}</span>
                                )}
                                {c.asking_price != null && (
                                  <span className="text-xs text-muted-foreground font-numeric">Ask ${Number(c.asking_price).toFixed(0)}</span>
                                )}
                                {c.asking_price != null && lo > 0 && hi > 0 && <DealChip asking={c.asking_price} low={lo} high={hi} />}
                              </div>
                              {isSealedRow(c) && c.ai_analysis?.chase?.[0] && (
                                <p className="mt-0.5 text-xs text-muted-foreground truncate">Top chase: {c.ai_analysis.chase[0].name} · ${Number(c.ai_analysis.chase[0].rawPrice ?? 0).toLocaleString()}</p>
                              )}
                            </div>
                          </button>
                          {!selecting && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="More actions"><MoreHorizontal className="w-4 h-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => addMany([c.id])}>Add to Collection</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => deleteMany([c.id])}>Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Insights;
