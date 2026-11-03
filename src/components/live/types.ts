import type { PriceCandidate } from "@/lib/packRip";

export type ScanMode = "price" | "collection" | "insight";

export type SealedChase = { rank: number; name: string; rawPrice: number | null; psa10?: number | null };

export type LiveTile = {
  id: string;                 // priceCheckId, or a temp id while checking
  kind: "card" | "sealed";
  status: "checking" | "done" | "nomatch";
  preview: string | null;     // object URL or signed URL of the flattened card
  imagePath: string | null;
  candidates: PriceCandidate[];
  selectedId: number | null;
  language: string | null;
  savedCardId: string | null;
  at: number;
  // sealed
  sealed?: { name: string; set: string | null; price: number | null; url: string; chase: SealedChase[] };
};

export const selectedOf = (t: LiveTile) => t.candidates.find(c => c.productId === t.selectedId) ?? t.candidates[0] ?? null;

export const MODE_LABEL: Record<ScanMode, string> = { price: "Price check", collection: "Add to collection", insight: "Insights" };

export const ebaySoldUrl = (q: string) =>
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`;
