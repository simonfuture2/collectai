import { useState } from "react";
import { Loader2, Sparkles, Plus, ExternalLink, Check, BookmarkPlus } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import PriceChartingAttribution from "@/components/PriceChartingAttribution";
import { parallelOf, ungradedPrice } from "@/lib/priceLadder";
import { flagFor } from "@/lib/liveDetect";
import { buyOffer, readShopMode } from "@/lib/partnerShops";
import { ebaySoldUrl, selectedOf, type LiveTile, type ScanMode } from "./types";

const PRICE_TILES: [string, string][] = [["ungraded", "Ungraded"], ["grade9", "PSA 9"], ["psa10", "PSA 10"], ["bgs10", "BGS 10"]];
const fmt = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"; };

export default function CardSheet({ tile, mode, onClose, onSelect, onSave, onFull, busy, cost }: {
  tile: LiveTile | null; mode: ScanMode; onClose: () => void;
  onSelect: (productId: number) => void; onSave: () => void; onFull: () => void;
  busy: "save" | "full" | null; cost: string;
}) {
  const c = tile ? selectedOf(tile) : null;
  const others = tile?.candidates.filter(o => o.productId !== c?.productId) ?? [];
  const saved = !!tile?.savedCardId;
  const saveLabel = mode === "insight" ? "Save to Insights – free" : "Add to collection – free";
  const name = c?.name.replace(/\[[^\]]*\]/g, "").replace(/#\s*\S+/g, "").replace(/\s+/g, " ").trim();
  const flag = flagFor(tile?.language);

  return (
    <Drawer open={!!tile} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[88vh]">
        <div className="mx-auto w-full max-w-md overflow-y-auto px-4 pb-6">
          {tile?.kind === "sealed" ? (
            <div className="pt-2">
              <DrawerTitle className="font-display text-lg">{tile.sealed?.name}</DrawerTitle>
              <p className="text-sm text-muted-foreground">{tile.sealed?.set}</p>
              <p className="mt-2 font-display text-3xl font-bold font-numeric">{fmt(tile.sealed?.price)}</p>
              <PriceChartingAttribution url={tile.sealed?.url} className="mt-1" />
              <h3 className="mt-4 text-sm font-semibold">Chase cards</h3>
              {tile.sealed?.chase.length ? (
                <ol className="mt-1 space-y-1">
                  {tile.sealed.chase.map(ch => (
                    <li key={ch.rank} className="flex justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                      <span className="truncate">{ch.rank}. {ch.name}</span><span className="font-numeric font-semibold">{fmt(ch.rawPrice)}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-muted-foreground">No chase list for this set yet.</p>}
              <a href={ebaySoldUrl(tile.sealed?.name ?? "")} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-primary">
                See sold listings <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          ) : tile && (
            <>
              <div className="flex gap-3 pt-2">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {tile.preview && <img src={tile.preview} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <DrawerTitle className="font-display text-lg leading-tight">{c ? `${name}${c.number ? ` #${c.number}` : ""}` : "No match"}</DrawerTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {c && parallelOf(c.name) && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{parallelOf(c.name)}</span>}
                    {flag && <span>{flag} {tile.language}</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c?.set}</p>
                  {saved && <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary"><Check className="h-3.5 w-3.5" />Saved</p>}
                </div>
              </div>

              {c ? (
                <>
                  <div className="mt-4 grid grid-cols-4 gap-1.5">
                    {PRICE_TILES.map(([k, l]) => (
                      <div key={k} className={`rounded-xl px-1 py-2 text-center ${k === "ungraded" ? "gradient-primary text-primary-foreground" : "bg-muted"}`}>
                        <p className="text-[10px] opacity-80">{l}</p>
                        <p className="font-numeric text-sm font-bold">{fmt(c.ladder?.[k])}</p>
                      </div>
                    ))}
                  </div>
                  <PriceChartingAttribution productId={c.productId} url={c.url} className="mt-2" />
                  <ShopOffer value={Number(c.ladder?.ungraded)} />
                </>
              ) : <p className="mt-4 text-sm text-muted-foreground">No PriceCharting match. Pick one below if it's there.</p>}

              {others.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-semibold">Is this the right card?</h3>
                  <div className="mt-2 flex gap-2 overflow-x-auto snap-x pb-1">
                    {others.map(o => (
                      <button key={o.productId} type="button" onClick={() => onSelect(o.productId)}
                        className="snap-start w-32 shrink-0 rounded-xl border border-border p-2 text-left">
                        <div className="mb-1.5 h-12 rounded-md bg-muted" />
                        <p className="line-clamp-2 text-xs font-semibold leading-tight">{o.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{o.number ? `#${o.number} · ` : ""}{o.set}</p>
                        <p className="font-numeric text-sm font-bold">{fmt(ungradedPrice(o.ladder))}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-5 space-y-2">
                {c && (
                  <Button className="w-full gradient-primary" disabled={saved || busy !== null} onClick={onSave}>
                    {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "insight" ? <BookmarkPlus className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                    {saved ? "Saved" : saveLabel}
                  </Button>
                )}
                {c && mode !== "insight" && (
                  <Button variant="outline" className="w-full" disabled={busy !== null} onClick={onFull}>
                    {busy === "full" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Full analysis · {cost}
                  </Button>
                )}
                <a href={ebaySoldUrl(c ? `${name} ${c.number ?? ""} ${c.set ?? ""}` : "")} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1 py-1 text-sm text-primary">See sold listings <ExternalLink className="h-3.5 w-3.5" /></a>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Shop mode: suggested buy offer as a % of the ungraded market value (editable per check). */
function ShopOffer({ value }: { value: number }) {
  const shop = readShopMode();
  const [pct, setPct] = useState(shop?.pct ?? 60);
  if (!shop) return null;
  const offer = buyOffer(value, pct);
  return (
    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
      <div>
        <p className="text-xs text-muted-foreground">Buy offer · {shop.shopName}</p>
        <p className="font-numeric text-xl font-bold">{offer != null ? `$${offer.toFixed(2)}` : "—"}</p>
      </div>
      <label className="flex items-center gap-1 text-sm">
        <input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Buy offer percent"
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right" />%
      </label>
    </div>
  );
}
