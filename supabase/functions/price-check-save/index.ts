// Saves a price check as a free, price-only card. Never deducts credits.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { priceOnlyCardRow, type SavedCandidate } from "./rules.ts";

const Body = z.object({ priceCheckId: z.string().uuid(), folderId: z.string().uuid().optional() });
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: authErr } = await userClient.auth.getClaims(auth.slice(7));
    if (authErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { priceCheckId, folderId } = parsed.data;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: check } = await admin.from("price_checks")
      .select("id, user_id, image_path, identification, candidates, selected_product_id, added_card_id")
      .eq("id", priceCheckId).eq("user_id", userId).maybeSingle();
    if (!check) return json({ error: "Price check not found" }, 404);
    if (check.added_card_id) return json({ error: "Already added", cardId: check.added_card_id }, 409);
    if (!check.image_path) return json({ error: "This check has no photo" }, 400);

    if (folderId) {
      const { data: f } = await admin.from("folders").select("id").eq("id", folderId).eq("user_id", userId).maybeSingle();
      if (!f) return json({ error: "Folder not found" }, 404);
    }

    // Duplicate: same user + same photo → reuse that card.
    const { data: dup } = await admin.from("cards").select("id").eq("user_id", userId).eq("image_url", check.image_path).limit(1).maybeSingle();
    let cardId = dup?.id as string | undefined;
    let duplicate = !!cardId;

    if (!cardId) {
      const list = (check.candidates as SavedCandidate[] | null) ?? [];
      const selected = list.find(c => Number(c.productId) === Number(check.selected_product_id)) ?? list[0] ?? null;
      const ident = (check.identification as any) ?? {};
      const reading = ident.best ?? ident ?? {};
      const row = priceOnlyCardRow(userId, check.image_path, selected, reading, new Date().toISOString());
      const { data: card, error } = await admin.from("cards").insert(row).select("id").single();
      if (error) throw error;
      cardId = card.id;
      duplicate = false;
    }

    if (folderId) await admin.from("card_folders").upsert({ card_id: cardId, folder_id: folderId }, { onConflict: "card_id,folder_id", ignoreDuplicates: true });
    await admin.from("price_checks").update({ added_card_id: cardId }).eq("id", check.id).is("added_card_id", null);
    return json({ cardId, duplicate });
  } catch (e) {
    console.error("[price-check-save]", e);
    return json({ error: "Could not save card" }, 500);
  }
});
