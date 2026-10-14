import { supabase } from "@/integrations/supabase/client";

/** Extract the storage path from a stored value (path or legacy URL). */
export function cardImagePath(imageUrlOrPath: string | null | undefined): string | null {
  if (!imageUrlOrPath) return null;
  if (!imageUrlOrPath.startsWith("http")) return imageUrlOrPath;
  const m = imageUrlOrPath.match(/card-images\/(.+?)(\?|$)/);
  return m?.[1] ?? null;
}

export async function getSignedImageUrl(imageUrlOrPath: string | null | undefined) {
  if (!imageUrlOrPath) return "";
  const path = cardImagePath(imageUrlOrPath);
  if (!path) return imageUrlOrPath;
  const { data } = await supabase.storage.from("card-images").createSignedUrl(path, 3600);
  return data?.signedUrl || imageUrlOrPath;
}

/** Delete a card row and its stored image. */
export async function deleteCardAndImage(card: { id: string; image_url?: string | null }) {
  const path = cardImagePath(card.image_url);
  if (path) await supabase.storage.from("card-images").remove([path]);
  return supabase.from("cards").delete().eq("id", card.id);
}
