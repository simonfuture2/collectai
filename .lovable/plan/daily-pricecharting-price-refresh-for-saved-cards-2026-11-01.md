# Daily PriceCharting price refresh for saved cards

## What changes for users
- Each morning, after the daily PriceCharting download finishes (it runs at 04:00 UTC), every saved card that has a PriceCharting match gets that day's prices.
- Price-only cards, and fully analysed cards valued by PriceCharting, also get a new value (the price ±10%) and a new entry in their price history.
- Fully analysed cards valued from eBay keep their value. Only their stored PriceCharting price list updates.
- Cards from categories that aren't in the daily download (for example sports cards from SportsCardsPro) refresh at most once every 7 days. Those refreshes go through the existing rate-limited PriceCharting lookup.

## Technical details

**1. Database function `public.pc_refresh_cards_from_catalog()` (migration, SECURITY DEFINER, service_role only)**
- Set-based: joins `cards.pricecharting_id = pricecharting_catalog.id`, with no outside calls.
- Builds the ladder jsonb in dollars, using the same keys as `normalizeLadder` (ungraded, grade1..9, grade9_5, psa10, bgs10, cgc10, sgc10, cgc10_pristine, bgs10_black, tag10, ace10). Missing prices are left out.
- For every matched card, sets `pc_prices` and `pc_synced_at = now()`.
- Eligible cards are those with `analysis_depth = 'price_only'` or `ai_analysis->>'valuationSource' = 'pricecharting'`. Their price comes from the rung saved on the card: `ai_analysis->>'pcRung'`, defaulting to `ungraded` for price-only cards. The grade-to-rung mapping stays only in `pcValuation.ts`.
  - When that rung has a price: `estimated_value_low/high = price × 0.9 / × 1.1`. `ai_analysis.pcValue` and `ai_analysis.pcLadder` are updated so the card page panel matches.
  - When the rung has no price, the value is left as it is (never invented).
  - A `price_history` row is added with source 'pricecharting' and median/low/high set to the price.
- Returns counts (updated, revalued, history rows).

**2. pricecharting-sync**
- After the category loop (including runs where every category was skipped as already synced today), call the function and log or return its counts.
- Then refresh live-only cards: cards whose `pricecharting_id` isn't in the catalog and whose `pc_synced_at` is null or older than 7 days. These go oldest first, capped per run (about 150, which fits the ~1.1s throttle inside the function time limit). Each is fetched with the existing cache-first, throttled `fetchProduct`, then `normalizeLadder`, and the same update and history rules are applied in TypeScript using `pcHeadline`. Anything not reached waits for the next day.

**3. Shared rule + tests**
- Add `refreshDecision(card, ladder)` to `pcValuation.ts`. It decides whether a card is eligible, which rung to use, and the new low/high (or no change). It's used by the live path and documents what the SQL does.
- Tests with concrete values: an eligible price-only card at $100 becomes $90–$110; an eBay-valued full card isn't revalued; a missing rung means no change; a card synced 6 days ago is skipped and one synced 8 days ago is refreshed.

**4. Verify**
- Run the tests. Run the database function once and check the counts plus a sample card's `pc_prices`, values and new history row. Invoke the sync and check its logs.
- Record the rule in AGENTS.md.
