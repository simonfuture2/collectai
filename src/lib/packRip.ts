import type { TablesInsert, Json } from "@/integrations/supabase/types";

export type PriceCandidate = { productId: number; name: string; set: string | null; number: string | null; ladder: Record<string, number>; url: string; parallel?: string | null; rank?: number; japanese?: boolean };
export type PackPull = {
  priceCheckId: string; cardName: string; cardSet?: string | null;
  selected: PriceCandidate | null; imagePath: string; imagePreview?: string;
  cardId?: string; fullAnalysis?: boolean; category?: string | null; year?: string | null;
};
export const FULL_ANALYSIS_CREDITS = 1;
export const pullValue = (p: PackPull): number => {
  const value = Number(p.selected?.ladder?.ungraded);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
export const sortedPulls = (pulls: PackPull[]) => [...pulls].sort((a, b) => pullValue(b) - pullValue(a));
export const packSummary = (pulls: PackPull[]) => {
  const best = sortedPulls(pulls)[0];
  return { total_value: pulls.reduce((sum, p) => sum + pullValue(p), 0), best_pull_name: best?.cardName ?? null, best_pull_value: best ? pullValue(best) : null };
};
export const storedPulls = (pulls: PackPull[]): Json => JSON.parse(JSON.stringify(pulls.map(({ imagePreview: _preview, ...p }) => p)));
export const chaseHit = (pull: PackPull, chase: { catalogId: string | number }[]) =>
  !!pull.selected && chase.some(c => String(c.catalogId) === String(pull.selected?.productId));
export function priceOnlyCard(p: PackPull, userId: string, id: string): TablesInsert<"cards"> {
  return {
    id, user_id: userId, image_url: p.imagePath, card_name: p.cardName, card_set: p.cardSet,
    card_year: p.year, category: p.category, analysis_depth: "price_only", analysis_status: "complete",
    scan_purpose: "collection", item_type: "card", pricecharting_id: p.selected?.productId ?? null,
    pc_prices: p.selected?.ladder ?? null, pc_synced_at: new Date().toISOString(),
    estimated_value_low: p.selected?.ladder?.ungraded ?? null, estimated_value_high: p.selected?.ladder?.ungraded ?? null,
  };
}