# PriceCharting: full grade ladder, call spacing, cache, new categories, catalog candidates

No screens change and no tables change. Existing exports (`getPriceChartingData`, `searchProducts`, `scoreSetName`, `setAliasTokens`, `tokensOf`, types, `PC_BASE`/`SCP_BASE`) keep working with the same signatures.

## 1. `normalizeLadder(row)` in `_shared/pricecharting.ts`
- Accepts an API row (hyphen keys like `condition-9-price`) or a catalog row (underscore keys like `condition_9_price`). Values are in cents in both, so it divides by 100.
- Returns `{ ungraded, grade1..grade6, grade7, grade8, grade9, grade9_5, psa10, bgs10, cgc10, sgc10, cgc10_pristine, bgs10_black, tag10, ace10 }` mapped exactly as you listed. Missing, zero or unreadable values are left out.
- Adds an exported `PriceLadder` type and `LADDER_KEYS` map (grade to PriceCharting key) so other code reads the same mapping.

## 2. Call spacing and 24h cache for every live call
- New helper `pcThrottledFetch(url)`: calls the `pc_acquire_slot()` database function with the backend service client, waits the returned ms, then fetches. If the function can't be reached, it waits 1100 ms anyway so it never goes faster than once a second.
- `fetchProduct`: reads `pricecharting_live_cache` first, looked up by the lowercased query text (`base|query`, so PriceCharting and SportsCardsPro answers don't mix). Uses the saved answer if it is less than 24 hours old; otherwise makes the spaced call and saves the result (product id + query + payload).
- `searchProducts`: same flow. The cache table needs a product id on every row, so search results are saved under the first result's product id (as noted last time). Empty results aren't saved.
- Cache read/write failures never break a lookup; they just fall through to the live call.

## 3. `pricecharting-sync`
- Store the condition columns the CSV has but the sync currently drops: `condition-9/10/13/14/15/16/19/20/21/22-price` into the matching `condition_*_price` columns (17/18 are already stored).
- Before adding Lorcana and Dragon Ball, open PriceCharting's category pages on the website to confirm the exact slugs (expected `lorcana-cards` and `dragon-ball-cards`, but only the confirmed slugs go in). If a slug can't be confirmed, I'll leave it out and tell you.
- One CSV download per category per day: before downloading, skip a category whose rows already have `last_synced_at` from today (UTC), unless the request passes `force=true`. Results say "skipped (already synced today)".

## 4. `searchCatalogCandidates(identification, limit = 8)`
- Searches only the stored list (no PriceCharting call). Matches `product_name` against the card name with `ilike`, which uses the trigram index, plus a second pass on the card number (e.g. `#25`) to catch name variations. Pulls up to ~60 rows.
- Scores each row: name token overlap, exact number match (strong bonus, mismatch penalty), `scoreSetName` on `console_name`, and a small category bonus. Returns the top `limit` as `{ product_id, product_name, console_name, category, score, ladder }`, with `ladder` from `normalizeLadder`.

## Checks
- Deploy both functions, then: run one live lookup twice and confirm the second comes from the cache in the logs; confirm sync skips categories already synced today; call `searchCatalogCandidates` on a known Pokémon card (e.g. Charizard 4 Base Set) and check it ranks first with its grade prices.
- Add a small Deno test for `normalizeLadder` (cents to dollars, every key mapping, missing values left out).

## Technical notes
- True trigram similarity ordering would need a small database function; to stay inside "no database changes", ranking uses `ilike` (index-backed) + app-side scoring. I can add a read-only `similarity()` function later if ranking needs it.
- The manual sync with `force=true` is the only way to re-download the same day.
