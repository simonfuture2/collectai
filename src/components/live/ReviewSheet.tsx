import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ungradedPrice } from "@/lib/priceLadder";
import { selectedOf, type LiveTile, type ScanMode } from "./types";
import { tileValue } from "./ResultsStrip";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReviewSheet({ open, onOpenChange, tiles, mode, isPro, credits, onSaveAll, onFullAll, onClear }: {
  open: boolean; onOpenChange: (o: boolean) => void; tiles: LiveTile[]; mode: ScanMode; isPro: boolean; credits: number;
  onSaveAll: (ids: string[], progress: (done: number) => void) => Promise<number>;
  onFullAll: (ids: string[], progress: (done: number) => void) => Promise<void>;
  onClear: () => void;
}) {
  const savable = tiles.filter(t => t.kind === "card" && t.status === "done");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [warn, setWarn] = useState(false);
  useEffect(() => { if (open) { setPicked(new Set(savable.map(t => t.id))); setWarn(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = savable.filter(t => picked.has(t.id)).map(t => t.id);
  const unsaved = ids.filter(id => !tiles.find(t => t.id === id)?.savedCardId);
  const total = tiles.filter(t => t.kind === "sealed" || picked.has(t.id)).reduce((s, t) => s + tileValue(t), 0);
  const cost = isPro ? "Free with Pro" : `${ids.length} credit${ids.length === 1 ? "" : "s"}`;
  const n = unsaved.length;

  const run = async (fn: typeof onSaveAll | typeof onFullAll, list: string[]) => {
    setProgress({ done: 0, total: list.length });
    try { await fn(list, (done) => setProgress({ done, total: list.length })); } finally { setProgress(null); }
  };

  const full = () => {
    if (!isPro && credits < ids.length && !warn) { setWarn(true); return; }
    run(onFullAll, ids);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden px-4 pb-6">
          <div className="flex items-baseline justify-between pt-2">
            <DrawerTitle className="font-display text-lg">Review {tiles.length} scans</DrawerTitle>
            <span className="font-display text-xl font-bold font-numeric">{money(total)}</span>
          </div>
          <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
            {tiles.map(t => {
              const c = selectedOf(t);
              const can = t.kind === "card" && t.status === "done";
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2">
                  <Checkbox checked={can && picked.has(t.id)} disabled={!can || !!t.savedCardId}
                    onCheckedChange={(v) => setPicked(p => { const s = new Set(p); v ? s.add(t.id) : s.delete(t.id); return s; })} />
                  <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-background">{t.preview && <img src={t.preview} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.kind === "sealed" ? t.sealed?.name : c?.name ?? "No match"}</p>
                    <p className="text-xs text-muted-foreground">{t.savedCardId ? "Saved" : t.kind === "sealed" ? "Sealed · view only" : c?.set}</p>
                  </div>
                  <span className="font-numeric text-sm font-semibold">{t.kind === "sealed" ? (t.sealed?.price != null ? money(t.sealed.price) : "—") : ungradedPrice(c?.ladder) != null ? money(ungradedPrice(c?.ladder)!) : "—"}</span>
                </li>
              );
            })}
          </ul>

          {progress && <div className="mt-3"><Progress value={(progress.done / Math.max(1, progress.total)) * 100} /><p className="mt-1 text-center text-xs text-muted-foreground">{progress.done} of {progress.total}</p></div>}
          {warn && (
            <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
              You have {credits} credit{credits === 1 ? "" : "s"}; this needs {ids.length}. Cards beyond your credits won't start.
              <div className="mt-2 flex gap-2"><Link to="/pricing" className="text-primary underline">Get credits</Link><button type="button" className="underline" onClick={() => run(onFullAll, ids)}>Continue anyway</button></div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <Button className="w-full gradient-primary" disabled={!n || !!progress} onClick={() => run(onSaveAll, unsaved)}>
              {progress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {mode === "insight" ? `Save ${n} to Insights – free` : `Add ${n} to collection – free`}
            </Button>
            {mode !== "insight" && (
              <Button variant="outline" className="w-full" disabled={!ids.length || !!progress} onClick={full}>
                <Sparkles className="mr-2 h-4 w-4" />Full analysis on selected · {cost}
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>Keep scanning</Button>
              <Button variant="ghost" className="flex-1 text-destructive" disabled={!!progress} onClick={onClear}>Clear</Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
