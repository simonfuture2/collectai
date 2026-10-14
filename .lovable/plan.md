# Sealed product scanning with a Top 5 chase list (database and backend only)

A scan of a booster pack, booster box, Elite Trainer Box, blaster or hobby box identifies the product and set, prices the sealed product, and lists the 5 most valuable cards in that set. No new screens yet. It works in both Collection and Insights mode.

Core rule: the chase list and every price in it come from real price data only. AI reads the packaging and writes a short summary from the finished data. It never picks cards or prices. If the set can't be matched, the result says so and shows no list.

## Important finding
The local price catalog currently holds **Pokémon only** (about 88,000 rows, 765 sets, 65 with barcodes). One Piece, Magic, Yu-Gi-Oh and the other card games are not in it. So:
- Pokémon: built from the local catalog (full set, cached 24 hours).
- Everything else (One Piece, Magic, Yu-Gi-Oh, Lorcana, sports): built from the live PriceCharting / SportsCardsPro search, marked partial (each search returns a limited number of results) and cached 12 hours.
- The planned One Piece booster box test will therefore come from the live search, not the catalog.

## 1. Database
- Cards get an item type (card, slab, sealed; default card) and an optional barcode.
- New chase-list cache: one row per game + set, with the built list, its source, and when it was refreshed. Signed-in users can read it; only the backend can write it.
- Two catalog indexes: by game + set name, and by barcode.

## 2. Starting a scan (identify-card)
- Accepts item type (default card; anything else is rejected) and an optional barcode (digits only, 8–14 long; anything else is rejected).
- Both are saved on the new card and passed on to the analysis step. Credits and limits are unchanged.

## 3. New sealed module
1. **Read the box:** Gemini reads the packaging with the instruction from the brief (game, set name and code, year, brand, product kind, language, the exact printed name, confidence; never guess an unreadable set).
2. **Find the set:**
   - With a barcode: an exact catalog match ("barcode").
   - Otherwise: score catalog set names using the same matching and Japanese ↔ English aliases the card pricing already uses. These are shared, not copied. Japanese products prefer "Japanese" sets. A minimum score is required. A tie returns both sets as candidates instead of guessing ("name").
3. **Pokémon list from the catalog:** sealed products are split from single cards by name. Top 5 singles by raw price, with raw, PSA 9, PSA 10, sales volume, a "thin market" flag (fewer than 3 sales) and the catalog id. The sealed product closest to the scanned kind gives the market price. The list also records the set's last sync time. The first 20 sealed scans log both price columns, to confirm which one holds sealed prices.
4. **Other games and sports from the live search:** search "year brand set", pick the best-matching set, search that set, drop sealed names, take the top 5 by raw price with the same fields, and mark it partial.
5. **No match:** returns "not matched", the reason, any candidate sets, and an eBay sold-listings link for the printed product name.
6. **Cache:** reused if fresher than 24 hours (catalog) or 12 hours (live search); otherwise rebuilt and saved.
7. Every chase card gets an eBay sold-listings link for "set + card name".

## 4. Analysis step (enrich-card)
- Sealed items skip the card pipeline, pre-grading, defect maps and price-history writes.
- The card is saved with:
  - the printed name, matched set, year and game, and no condition grade
  - a value range of sealed price ×0.9 to ×1.1, or empty when there is no sealed price
  - the full sealed result, marked complete
- A new Claude task writes a 2–3 sentence beginner summary using only the built data, with the brief's no-odds / no-invented-prices instruction. If that call fails, the result is saved without a summary.

## 5. Collection
- Sealed items can be saved to the collection. Portfolio totals already use the value range, so they count automatically.

## 6. Test
- Run four photos (one each): Pokémon Scarlet & Violet booster pack, One Piece booster box, Japanese Pokémon booster box, sports hobby box.
- For each, report the matched set, how it matched, the sealed price and the Top 5, plus the function logs.
- Product photos are needed for this. If you don't supply them, I'll use public product images.

## Technical details
- Migration: the brief's SQL, plus GRANT SELECT on `sealed_chase_cache` to authenticated, GRANT ALL to service_role, RLS enabled, and one authenticated SELECT policy.
- `_shared/pricecharting.ts`: export `tokensOf`, the set-alias expansion, a set-scoring helper, and the API base/key helper used by `lookupApi`.
- `_shared/gemini.ts`: add a generic `geminiVisionJson(imageUrl, prompt)` helper reusing the same model constant.
- `_shared/claude.ts`: add `SEALED_SUMMARY` to MODELS (env `CLAUDE_MODEL_SEALED`, default claude-sonnet-5-5) and allow per-call `maxTokens` (1500) and low effort.
- New `_shared/sealed.ts`: identifySealed, resolveSet, buildChaseFromCatalog, buildChaseLive (covers non-Pokémon TCGs and sports), cache read/write, eBay URL builder.
- Deploy identify-card and enrich-card. Record the "chase lists come only from price data, never AI" rule in AGENTS.md.
