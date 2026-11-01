import PriceChartingAttribution from "@/components/PriceChartingAttribution";
import { ExternalLink } from "lucide-react";
import { FULL_LADDER, GRADED_CHIPS, type Ladder } from "@/lib/priceLadder";

const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
export const NO_PC_GRADE_NOTE = "No PriceCharting data for this grade";

type Analysis = {
  valuationSource?: string;
  pcValue?: number | null;
  pcRung?: string | null;
  pcLadder?: Ladder;
  pricechartingId?: string | number | null;
  marketCrossCheck?: { median: number; gapPct: number; flagged: boolean; soldCount?: number } | null;
  crossCheckNote?: string;
};

export const isPriceChartingValued = (a: unknown): a is Analysis =>
  !!a && (a as Analysis).valuationSource === "pricecharting";

const rungLabel = (k?: string | null) => FULL_LADDER.find(([key]) => key === k)?.[1] ?? "Ungraded";

/** PriceCharting headline first, then "Recent eBay sales" as a secondary cross-check panel. */
export default function PriceChartingValuePanel({ analysis, pricechartingId, syncedAt }: {
  analysis: Analysis; pricechartingId?: string | number | null; syncedAt?: string | null;
}) {
  const ladder = analysis.pcLadder || {};
  const id = pricechartingId ?? analysis.pricechartingId;
  const value = analysis.pcValue;
  const cc = analysis.marketCrossCheck;
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-primary/40 bg-card p-5 space-y-4">
        <div>
          <p className="font-display text-4xl font-bold">{value ? usd(value) : "No price"}</p>
          <p className="text-sm text-muted-foreground">
            {value ? `${rungLabel(analysis.pcRung)} · PriceCharting` : NO_PC_GRADE_NOTE}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {GRADED_CHIPS.map(([k, label]) => {
            const v = Number(ladder[k]);
            const ok = Number.isFinite(v) && v > 0;
            return (
              <div key={k} className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                {ok ? <p className="font-semibold">{usd(v)}</p> : <p className="text-xs text-muted-foreground">{NO_PC_GRADE_NOTE}</p>}
              </div>
            );
          })}
        </div>
        <PriceChartingAttribution productId={id} syncedAt={syncedAt} />
      </section>
      {cc && (
        <section className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <p className="text-sm font-semibold">Recent eBay sales</p>
          <p className="text-sm">
            Median {usd(cc.median)}
            {cc.soldCount ? <span className="text-muted-foreground"> · {cc.soldCount} sold</span> : null}
            <span className="text-muted-foreground"> · {cc.gapPct}% from PriceCharting</span>
          </p>
          {cc.flagged && analysis.crossCheckNote && <p className="text-xs text-muted-foreground">{analysis.crossCheckNote}</p>}
        </section>
      )}
    </div>
  );
}
