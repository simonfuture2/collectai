// Pure builder for the price-only card row. Never invents a price.
export type SavedCandidate = {
  productId: number; name: string; set?: string | null; number?: string | null;
  ladder?: Record<string, number> | null;
};

const parallelOf = (name: string) => name.match(/\[([^\]]+)\]/)?.[1] ?? null;
const cleanName = (name: string) => name.replace(/\[[^\]]*\]/g, "").replace(/#\s*[\w-]+/, "").replace(/\s+/g, " ").trim();

export function priceOnlyCardRow(
  userId: string, imagePath: string, c: SavedCandidate | null,
  reading: { name?: string; set?: string | null; number?: string | null; year?: string | null; variant?: string | null },
  nowIso: string,
) {
  const raw = Number(c?.ladder?.ungraded);
  const ungraded = Number.isFinite(raw) && raw > 0 ? raw : null;
  return {
    user_id: userId,
    image_url: imagePath,
    scan_purpose: "collection",
    item_type: "card",
    analysis_depth: "price_only",
    analysis_status: "complete",
    card_name: (c ? cleanName(c.name) : "") || reading.name || "Unidentified card",
    card_set: c?.set ?? reading.set ?? null,
    card_number: c?.number ?? reading.number ?? null,
    card_year: reading.year || null,
    variant: (c ? parallelOf(c.name) : null) ?? (reading.variant || null),
    pricecharting_id: c?.productId ?? null,
    pc_prices: c?.ladder ?? null,
    pc_synced_at: nowIso,
    estimated_value_low: ungraded,
    estimated_value_high: ungraded,
    ai_analysis: { valuationSource: "pricecharting", note: "Price only" },
  };
}
