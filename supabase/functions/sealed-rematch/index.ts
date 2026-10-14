// Rebuild a sealed product's chase list for a set the user picked from "Did you mean…?".
// Chase list and prices come only from price data (see _shared/sealed.ts).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  buildChaseFromCatalog, cacheKey, ebaySold, gameCategory, isSportsGame, pickSealed, readCache, resolveAndBuildLive, writeCache,
} from "../_shared/sealed.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const cardId = typeof body.cardId === "string" ? body.cardId : "";
    const consoleName = typeof body.consoleName === "string" ? body.consoleName.trim().slice(0, 200) : "";
    if (!/^[0-9a-f-]{36}$/i.test(cardId) || !consoleName) return json({ error: "cardId and consoleName are required" }, 400);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: card } = await db.from("cards").select("id,user_id,item_type,ai_analysis").eq("id", cardId).maybeSingle();
    if (!card || card.user_id !== user.id) return json({ error: "Not found" }, 404);
    if (card.item_type !== "sealed") return json({ error: "Not a sealed product" }, 400);

    const a = (card.ai_analysis || {}) as Record<string, any>;
    const ident = a.identification || {};
    // Only allow sets we offered, so the endpoint can't be used to query arbitrary data.
    if (!Array.isArray(a.candidates) || !a.candidates.includes(consoleName)) return json({ error: "Unknown set" }, 400);

    const category = gameCategory(ident.game);
    if (!category) return json({ error: "Unsupported game" }, 400);
    const key = cacheKey(category, consoleName);
    let result = await readCache(db, key);
    if (!result) {
      if (category === "pokemon-cards" && !isSportsGame(ident.game)) {
        result = await buildChaseFromCatalog(db, category, consoleName, ident.product_kind);
      } else {
        result = (await resolveAndBuildLive(ident.game, { ...ident, set_name: consoleName })).result;
      }
      if (result) await writeCache(db, key, category, consoleName, result);
    }
    if (!result || !result.chase.length) return json({ error: "No priced singles found for that set" }, 422);

    const hit = pickSealed(result.sealedProducts, ident.product_kind);
    const sealedPrice = hit?.price ?? null;
    const analysis = {
      ...a,
      matchMethod: "name", setMatched: true, matchedSet: consoleName, reason: null,
      sealedPrice, sealedProductName: hit?.name ?? null, sealedProducts: result.sealedProducts,
      chase: result.chase, source: result.source, partial: result.partial, lastSyncedAt: result.lastSyncedAt,
      ebaySoldUrl: a.ebaySoldUrl || ebaySold(ident.printed_name || consoleName),
    };
    const { data: updated, error } = await db.from("cards").update({
      card_set: consoleName,
      estimated_value_low: sealedPrice != null ? Math.round(sealedPrice * 0.9 * 100) / 100 : null,
      estimated_value_high: sealedPrice != null ? Math.round(sealedPrice * 1.1 * 100) / 100 : null,
      ai_analysis: analysis,
    }).eq("id", cardId).select("*").single();
    if (error) throw error;
    console.log(`[sealed-rematch] card=${cardId} set=${consoleName} top5=${result.chase.length}`);
    return json({ card: updated });
  } catch (e) {
    console.error("[sealed-rematch]", (e as Error).message);
    return json({ error: "Couldn't rebuild the chase list" }, 500);
  }
});
