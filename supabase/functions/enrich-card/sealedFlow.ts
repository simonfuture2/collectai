// Sealed product enrichment: packaging → set → Top 5 chase list (price data only) → short summary.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildChaseFromCatalog, cacheKey, ChaseResult, ebaySold, gameCategory, identifySealed, isSportsGame,
  pickSealed, readCache, resolveAndBuildLive, resolveSetCatalog, SetMatch, writeCache,
} from "../_shared/sealed.ts";
import { callClaude } from "../_shared/claude.ts";

const CATALOG_CATEGORIES = new Set(["pokemon-cards"]); // only Pokémon is synced locally today

export async function runSealedEnrichment({ cardId, imageUrl, upc, db }: {
  cardId: string; imageUrl: string; upc: string | null; db: SupabaseClient;
}) {
  const t0 = Date.now();
  await db.from("cards").update({ analysis_status: "identifying", analysis_started_at: new Date().toISOString(), analysis_error: null }).eq("id", cardId);

  const ident = await identifySealed(imageUrl);
  if (!ident) throw new Error("Couldn't read the packaging");
  console.log(`[sealed] ident card=${cardId}`, JSON.stringify(ident));
  await db.from("cards").update({ card_name: ident.printed_name, card_year: ident.year, category: ident.game, analysis_status: "pricing" }).eq("id", cardId);

  const category = gameCategory(ident.game);
  let match: SetMatch = { matched: false, reason: "Unsupported game", candidates: [] };
  let result: ChaseResult | null = null;

  if (category) {
    const live = !CATALOG_CATEGORIES.has(category) || isSportsGame(ident.game);
    if (!live) match = await resolveSetCatalog(db, category, ident, upc);
    // Cache lookup once we know the set (catalog), or by identified set name (live).
    const keySet = match.matched ? match.consoleName : (live ? ident.set_name : null);
    const key = keySet ? cacheKey(category, keySet) : null;
    const cached = key ? await readCache(db, key) : null;
    if (cached) {
      result = cached;
      if (live) match = { matched: true, consoleName: keySet!, matchMethod: "name", candidates: [] };
      console.log(`[sealed] cache hit ${key}`);
    } else if (!live && match.matched) {
      result = await buildChaseFromCatalog(db, category, match.consoleName, ident.product_kind);
      await writeCache(db, key!, category, match.consoleName, result);
    } else if (live) {
      const r = await resolveAndBuildLive(ident.game, ident);
      match = r.match; result = r.result;
      if (result && ident.set_name) await writeCache(db, cacheKey(category, ident.set_name), category, match.matched ? match.consoleName : ident.set_name, result);
    }
  }

  // Sealed price is chosen per scanned product kind (cached lists are shared).
  const sealedHit = result ? pickSealed(result.sealedProducts, ident.product_kind) : null;
  const sealedPrice = sealedHit?.price ?? null;
  const setMatched = match.matched && !!result && result.chase.length > 0;

  const analysis: Record<string, unknown> = {
    itemType: "sealed",
    identification: ident,
    matchMethod: match.matched ? match.matchMethod : null,
    setMatched,
    matchedSet: match.matched ? match.consoleName : null,
    reason: match.matched ? (setMatched ? null : "Set matched but no priced singles found") : match.reason,
    candidates: match.candidates,
    sealedPrice,
    sealedProductName: sealedHit?.name ?? null,
    sealedProducts: result?.sealedProducts ?? [],
    chase: setMatched ? result!.chase : [],
    source: result?.source ?? null,
    partial: result?.partial ?? false,
    lastSyncedAt: result?.lastSyncedAt ?? null,
    ebaySoldUrl: ebaySold(ident.printed_name),
  };

  console.log(`[sealed] card=${cardId} set=${analysis.matchedSet} method=${analysis.matchMethod} sealedPrice=${sealedPrice} top5=${JSON.stringify((analysis.chase as any[]).map((c) => `${c.name} $${c.rawPrice}`))} ms=${Date.now() - t0}`);

  await db.from("cards").update({
    card_name: ident.printed_name,
    card_set: (analysis.matchedSet as string) || ident.set_name,
    card_year: ident.year,
    category: ident.game,
    condition_grade: null,
    estimated_value_low: sealedPrice != null ? Math.round(sealedPrice * 0.9 * 100) / 100 : null,
    estimated_value_high: sealedPrice != null ? Math.round(sealedPrice * 1.1 * 100) / 100 : null,
    ai_analysis: analysis,
    analysis_status: "complete",
    analysis_completed_at: new Date().toISOString(),
  }).eq("id", cardId);

  // Beginner summary — uses only the built data; failure is non-fatal.
  try {
    const { text } = await callClaude({
      task: "SEALED_SUMMARY",
      messages: [{
        role: "user",
        content: `In 2–3 plain sentences for a new collector, explain what this product is and which cards in the list are the chase cards. Use only the data provided. Do not state pull rates, odds, number of cards per pack, or any price not in the data.\n\n${JSON.stringify(analysis)}`,
      }],
    });
    if (text.trim()) await db.from("cards").update({ ai_analysis: { ...analysis, summary: text.trim() } }).eq("id", cardId);
  } catch (e) {
    console.warn("[sealed] summary skipped:", (e as Error).message);
  }
}
