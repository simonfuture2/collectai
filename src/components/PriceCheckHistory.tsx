import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tag, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { usePriceCheckAccess } from "@/hooks/use-price-check-access";
import { ungradedPrice } from "@/lib/priceLadder";

type Row = { id: string; image_path: string | null; candidates: unknown; selected_product_id: number | null; identification: unknown; created_at: string };
type Cand = { productId: number; name: string; set: string | null; ladder: Record<string, number> };
const PAGE = 20;
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function PriceCheckHistory() {
  const { allowed, loading: accessLoading } = usePriceCheckAccess();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<Row | null>(null);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    const { data } = await supabase.from("price_checks")
      .select("id, image_path, candidates, selected_product_id, identification, created_at")
      .order("created_at", { ascending: false }).range(offset, offset + PAGE);
    const list = (data ?? []) as Row[];
    setMore(list.length > PAGE);
    const page = list.slice(0, PAGE);
    setRows(prev => (offset ? [...prev, ...page] : page));
    const paths = page.map(r => r.image_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("card-images").createSignedUrls(paths, 3600);
      setUrls(prev => { const m = { ...prev }; signed?.forEach(s => { if (s.path && s.signedUrl) m[s.path] = s.signedUrl; }); return m; });
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) load(0); }, [allowed, load]);

  const remove = async (r: Row) => {
    setConfirm(null);
    const { error } = await supabase.from("price_checks").delete().eq("id", r.id);
    if (error) { toast({ title: "Could not delete", description: error.message, variant: "destructive" }); return; }
    setRows(prev => prev.filter(x => x.id !== r.id));
  };

  if (accessLoading || !allowed) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Tag className="h-5 w-5 text-primary" />Price check history</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!rows.length && !loading && <p className="text-sm text-muted-foreground">No price checks yet.</p>}
        {rows.map(r => {
          const cands = (r.candidates as Cand[] | null) ?? [];
          const c = cands.find(x => x.productId === r.selected_product_id) ?? null;
          const name = c?.name ?? (r.identification as { best?: { name?: string } } | null)?.best?.name ?? "Unidentified card";
          const price = ungradedPrice(c?.ladder);
          return (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
              <Link to={`/price/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                  {r.image_path && urls[r.image_path] && <img src={urls[r.image_path]} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[c?.set, new Date(r.created_at).toLocaleDateString()].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{price != null ? usd(price) : "No match"}</span>
              </Link>
              <Button variant="ghost" size="icon" aria-label={`Delete ${name}`} onClick={() => setConfirm(r)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          );
        })}
        {loading && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
        {more && !loading && <Button variant="outline" className="w-full" onClick={() => load(rows.length)}>Show more</Button>}
      </CardContent>
      <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this price check?</AlertDialogTitle>
            <AlertDialogDescription>It is removed from your history. Cards in your collection are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && remove(confirm)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
