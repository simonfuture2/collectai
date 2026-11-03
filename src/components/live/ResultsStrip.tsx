import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { parallelOf, ungradedPrice } from "@/lib/priceLadder";
import { flagFor } from "@/lib/liveDetect";
import { selectedOf, type LiveTile } from "./types";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function useCountUp(target: number) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 500);
      const cur = a + (target - a) * (1 - (1 - k) ** 3);
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target]);
  return v;
}

export const tileValue = (t: LiveTile) =>
  t.kind === "sealed" ? t.sealed?.price ?? 0 : ungradedPrice(selectedOf(t)?.ladder) ?? 0;

export default function ResultsStrip({ tiles, onOpen, onRemove }: {
  tiles: LiveTile[]; onOpen: (t: LiveTile) => void; onRemove: (t: LiveTile) => void;
}) {
  const total = tiles.reduce((s, t) => s + tileValue(t), 0);
  const shown = useCountUp(total);
  return (
    <div className="cam-glass rounded-2xl px-3 pt-2 pb-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs cam-muted">Total value</span>
        <span className="font-display text-lg font-bold font-numeric" aria-live="polite">{money(shown)}</span>
      </div>
      {tiles.length === 0 ? (
        <p className="py-3 text-center text-xs cam-muted">Scanned cards appear here</p>
      ) : (
        <div className="mt-1.5 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-0.5" style={{ scrollbarWidth: "none" }}>
          {tiles.map((t) => <Tile key={t.id} t={t} onOpen={onOpen} onRemove={onRemove} />)}
        </div>
      )}
    </div>
  );
}

function Tile({ t, onOpen, onRemove }: { t: LiveTile; onOpen: (t: LiveTile) => void; onRemove: (t: LiveTile) => void }) {
  const c = selectedOf(t);
  const raw = ungradedPrice(c?.ladder);
  const par = c ? parallelOf(c.name) : null;
  const flag = flagFor(t.language);
  const name = t.kind === "sealed" ? t.sealed?.name : c?.name.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return (
    <div className="relative snap-start shrink-0 w-[9.5rem]">
      <button type="button" onClick={() => onOpen(t)} disabled={t.status === "checking"}
        className="flex w-full gap-2 rounded-xl bg-[hsl(var(--cam-fg)/0.08)] p-1.5 text-left">
        <div className="h-[4.6rem] w-[3.3rem] shrink-0 overflow-hidden rounded-md bg-[hsl(var(--cam-fg)/0.1)]">
          {t.preview && <img src={t.preview} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          {t.status === "checking" ? (
            <div className="space-y-1.5 pt-1">
              <div className="h-2.5 w-full animate-pulse rounded bg-[hsl(var(--cam-fg)/0.2)]" />
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-[hsl(var(--cam-fg)/0.2)]" />
            </div>
          ) : t.status === "nomatch" ? (
            <p className="text-[11px] leading-tight">No match – tap to see options</p>
          ) : (
            <>
              <p className="truncate text-[11px] font-semibold leading-tight">{name}{c?.number && t.kind === "card" ? ` #${c.number}` : ""}</p>
              <div className="flex items-center gap-1">
                {par && <span className="truncate rounded bg-primary/30 px-1 text-[9px]">{par}</span>}
                {flag && <span className="text-[10px]">{flag}</span>}
              </div>
              <p className="truncate text-[10px] cam-muted">{t.kind === "sealed" ? t.sealed?.set : c?.set}</p>
              <p className="font-numeric text-sm font-bold leading-tight">
                {t.kind === "sealed" ? (t.sealed?.price != null ? money(t.sealed.price) : "—") : raw != null ? `Raw ${money(raw)}` : "Raw —"}
              </p>
              {t.kind === "card" && t.candidates.length > 1 && <p className="text-[9px] cam-muted">+{t.candidates.length - 1} matches</p>}
            </>
          )}
        </div>
      </button>
      {t.savedCardId && <span className="absolute left-1 top-1 rounded-full cam-ok-bg p-0.5"><Check className="h-2.5 w-2.5" /></span>}
      {t.status !== "checking" && (
        <button type="button" aria-label="Remove" onClick={() => onRemove(t)}
          className="absolute -right-1 -top-1 rounded-full cam-glass p-0.5"><X className="h-3 w-3" /></button>
      )}
    </div>
  );
}
