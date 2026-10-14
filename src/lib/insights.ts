import { supabase } from "@/integrations/supabase/client";

/** Move an insight scan into the owner's collection. RLS restricts to the owner. */
export async function moveInsightToCollection(cardId: string) {
  return supabase
    .from("cards")
    .update({
      scan_purpose: "collection",
      moved_to_collection_at: new Date().toISOString(),
      asking_price: null,
    })
    .eq("id", cardId);
}

export type DealTone = "good" | "bad" | "neutral";
export interface DealVerdict {
  label: "Below market" | "Above market" | "Fair price";
  tone: DealTone;
  diffPct: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Compare an asking price to the market range. */
export function dealVerdict(askingPrice: unknown, low: unknown, high: unknown): DealVerdict | null {
  const a = num(askingPrice), l = num(low), h = num(high);
  if (a === null || l === null || h === null) return null;
  const mid = (l + h) / 2;
  if (mid <= 0) return null;
  const diffPct = Math.round(((a - mid) / mid) * 100);
  if (a < l) return { label: "Below market", tone: "good", diffPct };
  if (a > h) return { label: "Above market", tone: "bad", diffPct };
  return { label: "Fair price", tone: "neutral", diffPct };
}
