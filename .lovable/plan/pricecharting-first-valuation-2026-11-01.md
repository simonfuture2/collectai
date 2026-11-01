# PriceCharting-first valuation

## What changes for users
- When a card matches PriceCharting, its value is the PriceCharting price: the ungraded price for raw cards, or the price for that exact grade for slabs. The range is that price ±10%.
- eBay and TCGplayer prices still get pulled, but only as a cross-check. If their median differs from PriceCharting by more than 25%, the value stays the same, confidence drops one step (high→medium→low), and a note says: "Recent eBay sales median $X differs by Y% from PriceCharting".
- Graded prices only come from PriceCharting. A grade with no price shows "No PriceCharting data for this grade". Prices are never made up by multiplying the raw price.
- If there's no PriceCharting match, the current eBay-led logic and the two-AI price check work exactly as they do now.
- On the scan result and card pages, the PriceCharting value comes first with "Prices from PriceCharting". "Recent eBay sales" appears below it as a second panel.

## Technical details

**New pure module `supabase/functions/_shared/pcValuation.ts` (with tests)**
- `rungForGrade(company, grade)` turns a slab grade into a ladder key: raw → ungraded; PSA 7 → cib; PSA 8 → new; PSA 9 → graded; PSA 10 → psa10 (manual-only); BGS 10 → bgs10; BGS 10 Black → bgs10_black; CGC 10 → cgc10; CGC Pristine 10 → cgc10_pristine; SGC 10 → sgc10; TAG 10 → tag10 (condition-21); ACE 10 → ace10; grades 1–6 → grade1..6. Any other grade returns null, which means no data.
- `pcHeadline(ladder, grade)` returns `{ value, low: value*0.9, high: value*1.1 }`, or null.
- `crossCheck(pcValue, ebaySoldMedian, ebayActiveMedian, tcgMedian)` takes the median of the available medians and returns `{ median, gapPct, flagged: gapPct > 25 }`.
- `lowerConfidence(level)` drops confidence one step.
- Tests use concrete values: the ±10% range, the 25% gap cut-off (25 not flagged, 26 flagged), PSA 9 → graded, PSA 10 → manual-only, TAG 10 → condition-21, a missing rung → null, and confidence dropping one step.

**marketData.ts**
- Return the full PriceCharting ladder (via `normalizeLadder`), `pricechartingId`, and `pcMatched`. PriceCharting no longer goes into the weighted blend (it currently gets 0.4/0.3/0.2/0.1 weights). When PC matched, the summary shows PC as the authoritative value and eBay/TCGplayer as "cross-check only". When PC didn't match, the existing weights and summary stay as they are.

**analysisEngine.ts**
- Prompt: when PC matched, the VALUATION FORMULA says the PriceCharting number is fixed and Claude must not change it. Claude explains condition, grading upside, and why eBay differs. The 50/30/20 block and the graded-multiplier rule (CGC ~0.85x PSA, etc.) are removed for this case. The fallback prompt stays the same.
- After Claude responds, when PC matched: overwrite estimatedValueLow/High with `pcHeadline`, set `valuationSource = 'pricecharting'`, and apply `crossCheck` (note plus confidence drop). Skip the Claude+Gemini verification step and the no-market-data caps/graded-anchor overrides.
- `gradedValueEstimates` is rebuilt only from the ladder. Missing grades are marked `{ value: null, note: "No PriceCharting data for this grade" }`. The ROI/grade-ceiling helper reads the ladder only and stops falling back to AI estimates when PC matched.
- Return `pricechartingId` and `pcLadder` on the result.

**Storing on the card**
- analyze-card and enrich-card write `pricecharting_id`, `pc_prices` (the ladder), and `pc_synced_at` when they're present. enrich-card already sets the id for upgrades; it will now also write the ladder.
- Redeploy the functions that import the shared engine: analyze-card, enrich-card, quick-scan, demo-scan, collectai-price, and any sealed callers.

**UI (ScanReveal page, CardDetail page)**
- When `valuationSource === 'pricecharting'`: a primary PriceCharting panel (headline value, grade-specific label, ladder chips with "No PriceCharting data for this grade" for missing rungs, attribution, and a "View on PriceCharting" link), reusing the existing price-only panel or ladder helpers. Below it, a secondary "Recent eBay sales" panel shows the median, count, and the gap note when flagged.
- Otherwise, the existing layout stays as it is.

**Verification**
- Run the new pcValuation tests and the existing pricecharting tests.
- Call analyze-card through the backend on a known card and check that valuationSource, the ±10% range, and the stored pc_prices are correct.
- The real end-to-end scan may still be blocked by the Gemini billing error.
