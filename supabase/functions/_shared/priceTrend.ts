// Shared price-trend helper.
// Computes real 30d/90d movement from the price_history table (and any
// PriceCharting points previously persisted there). Never a model guess.

export interface PriceTrend {
  status: "ok" | "insufficient_history";
  direction?: "up" | "down" | "flat";
  change30dPct?: number | null;
  change90dPct?: number | null;
  sampleSize: number;
  source: string;
  currentMedian?: number;
  baseline30d?: number | null;
  baseline90d?: number | null;
  computedAt: string;
}

interface HistoryRow {
  source: string;
  median_price: number | string | null;
  recorded_at: string;
}

const PREFERRED_SOURCES = ["pricecharting", "ebay", "ebay_sold", "blended"];

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function pickSeries(rows: HistoryRow[]): { source: string; series: { t: number; price: number }[] } {
  // Prefer the source with the most points (in preference order on ties).
  const bySource = new Map<string, { t: number; price: number }[]>();
  for (const r of rows) {
    const p = num(r.median_price);
    if (p === null || p <= 0) continue;
    const t = new Date(r.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const arr = bySource.get(r.source) || [];
    arr.push({ t, price: p });
    bySource.set(r.source, arr);
  }
  let best: { source: string; series: { t: number; price: number }[] } = { source: "price_history", series: [] };
  for (const src of [...PREFERRED_SOURCES, ...bySource.keys()]) {
    const series = bySource.get(src);
    if (!series) continue;
    if (series.length > best.series.length) {
      best = { source: src, series: series.sort((a, b) => a.t - b.t) };
    }
  }
  return best;
}

function nearestBefore(series: { t: number; price: number }[], targetMs: number): number | null {
  // Pick the point closest to target (within +/- 30 days tolerance).
  let chosen: { t: number; price: number } | null = null;
  let bestDelta = Infinity;
  const tolerance = 30 * 24 * 3600 * 1000;
  for (const p of series) {
    const delta = Math.abs(p.t - targetMs);
    if (delta < bestDelta && delta <= tolerance) {
      bestDelta = delta;
      chosen = p;
    }
  }
  return chosen ? chosen.price : null;
}

export async function computePriceTrend(
  supabaseAdmin: any,
  cardId: string,
): Promise<PriceTrend> {
  const computedAt = new Date().toISOString();
  const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("price_history")
    .select("source, median_price, recorded_at")
    .eq("card_id", cardId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  if (error || !Array.isArray(data) || data.length === 0) {
    return { status: "insufficient_history", sampleSize: 0, source: "price_history", computedAt };
  }

  const { source, series } = pickSeries(data as HistoryRow[]);
  if (series.length < 2) {
    return { status: "insufficient_history", sampleSize: series.length, source, computedAt };
  }

  const now = Date.now();
  const latest = series[series.length - 1];
  const baseline30 = nearestBefore(series, now - 30 * 24 * 3600 * 1000);
  const baseline90 = nearestBefore(series, now - 90 * 24 * 3600 * 1000);

  const change30dPct = baseline30 && baseline30 > 0
    ? ((latest.price - baseline30) / baseline30) * 100
    : null;
  const change90dPct = baseline90 && baseline90 > 0
    ? ((latest.price - baseline90) / baseline90) * 100
    : null;

  // If neither baseline exists, we don't have enough spread.
  if (change30dPct === null && change90dPct === null) {
    return { status: "insufficient_history", sampleSize: series.length, source, computedAt };
  }

  const primary = change30dPct ?? change90dPct ?? 0;
  const direction: "up" | "down" | "flat" =
    Math.abs(primary) < 2 ? "flat" : primary > 0 ? "up" : "down";

  return {
    status: "ok",
    direction,
    change30dPct: change30dPct !== null ? Math.round(change30dPct * 10) / 10 : null,
    change90dPct: change90dPct !== null ? Math.round(change90dPct * 10) / 10 : null,
    sampleSize: series.length,
    source,
    currentMedian: latest.price,
    baseline30d: baseline30,
    baseline90d: baseline90,
    computedAt,
  };
}
