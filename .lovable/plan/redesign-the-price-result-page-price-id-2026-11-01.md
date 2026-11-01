# Redesign the price result page (/price/:id)

Mobile-first, gold primary, Fredoka headings, Space Grotesk body (existing theme tokens only).

## Layout (top to bottom)
1. Photo of the user's card (rounded, 3:4), then card name, set and number.
2. Hero: ungraded price in large type, label "Ungraded · PriceCharting".
3. Graded chips: PSA 9, PSA 10, BGS 9.5, BGS 10, CGC 10, TAG 10 — only those with values. Tapping expands the full grade ladder.
4. Attribution: "Prices from PriceCharting" + "View on PriceCharting" button (new tab, product URL).
5. Fixed bottom area:
   - Horizontally scrolling, snap-swipe carousel of candidates (~140px cards): name, set, number, parallel, ungraded price. Selected card outlined in gold.
   - Tapping a candidate instantly swaps hero, chips and link (no loading), then saves the choice in the background.
   - "Not right? Search" opens a sheet that searches the stored PriceCharting list; picking a result becomes the selected card.
   - Action bar: "Scan next" (to /scan?mode=price), "Add to collection (free)", "Full analysis · 1 credit".
6. No match: "No PriceCharting match" with Search and "Run full analysis" buttons. Never shows a price.

Pack Rip behaviour (opening from a rip, syncing the pull and its price-only card) is kept.

## Technical details
- Saving `price_checks.selected_product_id`: users have no update access (service-write only by design), so add a small `price-check` action (`{ action: "select", priceCheckId, productId }`) that verifies ownership and that the product is among saved candidates (or a search result it re-fetches from the catalog), then updates the row. Search adds `{ action: "search", query }` that calls `searchCatalogCandidates` and returns candidates with ladders — no live API call, no credits.
- Search picks get appended to the row's `candidates` server-side so the page stays consistent on reload.
- Photo: signed URL from the row's `image_path` (card-images bucket).
- "Add to collection (free)": inserts a `price_only` card from the selected candidate (same rules as Pack Rip, in `src/lib/packRip.ts`); "Full analysis" reuses the existing reanalyze-card upgrade on that card (adds it first if needed), with the credit check server-side.
- Chip mapping and "only with values" filtering live in a small pure helper with adjacent tests (e.g. PSA 9 = grade9, PSA 10 = psa10, BGS 9.5 = grade9_5, BGS 10 = bgs10, CGC 10 = cgc10, TAG 10 = tag10).
- Bottom area uses safe-area padding; page content gets bottom padding so nothing hides under it.

## Not verifiable yet
Real candidates depend on card reading, which is still blocked by the Gemini billing issue; I'll verify with a seeded test row.
