// Which photos each scan type needs. Price checks read the front only; anything saved
// to a collection or graded needs the original front and back photos.
export type ScanModeKind = "price" | "collection" | "insight";
export type ScanItemType = "card" | "slab" | "sealed";

export function requiredSides(mode: ScanModeKind, itemType: ScanItemType = "card"): ("front" | "back")[] {
  if (mode === "price" || itemType === "sealed") return ["front"];
  return ["front", "back"];
}

/** filled = slot ids that have a photo. Sealed only needs any one photo. */
export function canSubmit(mode: ScanModeKind, itemType: ScanItemType, filled: string[]): boolean {
  if (filled.length === 0) return false;
  if (itemType === "sealed") return true;
  return requiredSides(mode, itemType).every(s => filled.includes(s));
}

/** Grading / full analysis needs both stored sides. */
export const canGrade = (card: { image_url?: string | null; back_image_url?: string | null }) =>
  !!card.image_url && !!card.back_image_url;
