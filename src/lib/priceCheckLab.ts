// Price Check Lab: pure stats, go/no-go rules and CSV export.

export const MAIN_TCGS = ["pokemon", "one-piece", "magic", "yugioh"] as const;
export const LAB_GAMES = ["pokemon", "one-piece", "magic", "yugioh", "lorcana", "sports", "other"] as const;
export const PRICE_MEDIAN_TARGET_MS = 4000;
export const TOP3_TARGET_PCT = 90;

export type LabMode = "price" | "full";

export interface LabItem {
  id: string;
  file_name: string | null;
  image_path: string;
  game: string;
  expected_product_id: number;
  is_slab: boolean;
  is_japanese: boolean;
}

export interface LabResult {
  item_id: string;
  mode: LabMode;
  latency_ms: number | null;
  rank: number | null; // 1-based position of the expected product; null = not in candidates
  top_product_id: number | null;
  no_match: boolean;
  api_calls: number;
  error: string | null;
}

export function percentile(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = (p / 100) * (v.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return Math.round(v[lo] + (v[hi] - v[lo]) * (idx - lo));
}

/** Position of the expected product in a ranked candidate id list (1-based), or null. */
export function rankOf(expected: number, candidateIds: Array<number | string | null | undefined>): number | null {
  const i = candidateIds.findIndex((id) => Number(id) === Number(expected));
  return i === -1 ? null : i + 1;
}

export interface LabSummary {
  count: number;
  errors: number;
  medianMs: number | null;
  p90Ms: number | null;
  top1Pct: number | null;
  top3Pct: number | null;
  noMatchPct: number | null;
  apiCalls: number;
  costPerScan: number;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** Errored runs count toward `errors` only; accuracy is measured over runs that returned. */
export function summarize(results: LabResult[], costPerScan: number): LabSummary {
  const ok = results.filter((r) => !r.error);
  return {
    count: results.length,
    errors: results.length - ok.length,
    medianMs: percentile(ok.map((r) => r.latency_ms ?? NaN), 50),
    p90Ms: percentile(ok.map((r) => r.latency_ms ?? NaN), 90),
    top1Pct: pct(ok.filter((r) => r.rank === 1).length, ok.length),
    top3Pct: pct(ok.filter((r) => r.rank != null && r.rank <= 3).length, ok.length),
    noMatchPct: pct(ok.filter((r) => r.no_match).length, ok.length),
    apiCalls: results.reduce((s, r) => s + (r.api_calls || 0), 0),
    costPerScan,
  };
}

export interface GoNoGo { speedOk: boolean | null; accuracyOk: boolean | null; go: boolean | null; mainTop3Pct: number | null }

/** Go = Price Check median < 4 s AND correct card in top 3 >= 90% across the four main TCGs. */
export function goNoGo(items: LabItem[], priceResults: LabResult[]): GoNoGo {
  const game = new Map(items.map((i) => [i.id, i.game]));
  const s = summarize(priceResults, 0);
  const main = summarize(priceResults.filter((r) => (MAIN_TCGS as readonly string[]).includes(game.get(r.item_id) ?? "")), 0);
  const speedOk = s.medianMs == null ? null : s.medianMs < PRICE_MEDIAN_TARGET_MS;
  const accuracyOk = main.top3Pct == null ? null : main.top3Pct >= TOP3_TARGET_PCT;
  return { speedOk, accuracyOk, mainTop3Pct: main.top3Pct, go: speedOk == null || accuracyOk == null ? null : speedOk && accuracyOk };
}

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(items: LabItem[], results: LabResult[]): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  const head = ["file", "game", "slab", "japanese", "expected_product_id", "mode", "latency_ms", "rank", "top_product_id", "correct_at_1", "in_top_3", "no_match", "api_calls", "error"];
  const rows = results.map((r) => {
    const i = byId.get(r.item_id);
    return [i?.file_name ?? i?.image_path, i?.game, i?.is_slab, i?.is_japanese, i?.expected_product_id, r.mode, r.latency_ms, r.rank,
      r.top_product_id, r.rank === 1, r.rank != null && r.rank <= 3, r.no_match, r.api_calls, r.error].map(esc).join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

/** Parse "file_name,product_id,game,slab,japanese" lines into a lookup by file name. */
export function parseLabels(text: string): Map<string, { productId: number; game?: string; slab?: boolean; japanese?: boolean }> {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [f, id, game, slab, jp] = line.split(",").map((x) => x?.trim());
    const n = Number(id);
    if (!f || !Number.isFinite(n) || n <= 0) continue;
    const yes = (x?: string) => /^(1|y|yes|true)$/i.test(x ?? "");
    out.set(f.toLowerCase(), { productId: n, game: game?.toLowerCase() || undefined, slab: yes(slab), japanese: yes(jp) });
  }
  return out;
}
