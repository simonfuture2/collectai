import { supabase } from "@/integrations/supabase/client";

/** Opens the camera / photo picker for the back of a card. Must be called from a tap. */
export function pickBackPhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    let done = false;
    const finish = (f: File | null) => { if (!done) { done = true; resolve(f); } };
    input.onchange = () => finish(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => finish(null));
    input.click();
  });
}

/** Uploads a back photo (original, unmodified) and returns its storage path. */
export async function uploadBackPhoto(userId: string, file: Blob, name = "back.jpg"): Promise<string> {
  const ext = name.split(".").pop() || "jpg";
  const path = `${userId}/${Date.now()}-back.${ext}`;
  const { error } = await supabase.storage.from("card-images").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return path;
}

/** Picks + uploads; null when the user cancels. */
export async function takeBackPhoto(userId: string): Promise<string | null> {
  const f = await pickBackPhoto();
  return f ? uploadBackPhoto(userId, f, f.name) : null;
}

/** Adds a back photo to a saved card (so it can be graded). */
export async function addBackToCard(userId: string, cardId: string): Promise<boolean> {
  const path = await takeBackPhoto(userId);
  if (!path) return false;
  const { error } = await supabase.from("cards").update({ back_image_url: path }).eq("id", cardId).eq("user_id", userId);
  if (error) throw error;
  return true;
}
