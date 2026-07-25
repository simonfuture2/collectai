## Problem

The card at `/card/28954004…bacf65` shows:
- Name: "Unknown Pokémon Card (Back Shown)"
- Market Value: $7.83 – $12.38

But the row is authenticated as **BGS 8**, cert **0020586708**, and is paired to a raw scan that already knows it's a **1999 Jungle Snorlax**. The paired raw card even stored the correct pre-grade estimate ($257 – $348) on `preGradePrediction`.

### Root cause (verified from the DB)

1. The graded card was originally scanned from a back-only photo, so identification failed and it was saved as "Unknown Pokémon Card (Back Shown)" with a fallback $7–$12 range.
2. When the slab was scanned, `scan-slab` kicked off `enrich-card` with the two **slab** photos (front-of-slab + back-of-slab). `enrich-card` re-ran identification on those slab images, still couldn't ID it, and re-persisted `card_name = "Unknown …"` plus the low fallback estimate — clobbering any chance of graded pricing.
3. Because `card_name` is unknown, market-data lookup returns nothing, so the "Market Value" ignores the graded BGS 8 eBay comps that the AI stack would otherwise pull.

`pair-cards` today only sets the pointers; it does not copy the raw card's identity onto the graded card and does not re-price.

## Fix

### 1. Use the paired raw card as the identity source for graded cards

In `supabase/functions/enrich-card/index.ts`:
- Before calling `runAnalysis`, load the target card. If it has `paired_raw_card_id`, fetch the paired raw's `card_name`, `card_set`, `card_year`, `edition`, `rarity`, `image_url`.
- Pass those identity fields into `runAnalysis` as a new optional `identityHint` so the engine can skip / override Gemini identification when the slab photos don't show the front.
- Persist the hinted identity onto the graded row instead of "Unknown …".

In `supabase/functions/_shared/analysisEngine.ts`:
- Accept `identityHint`. If Gemini returns no name (or a generic "Unknown …" name) and a hint is present, use the hint as `identification` for downstream market lookup and Claude analysis.
- When `knownGrade` is present, also append the raw card's front image URL to the images passed to Claude so it has something to reason about beyond the slab back.

### 2. Never let re-enrichment overwrite a known identity with "Unknown"

In `enrich-card` persist step: if the new `identification.card_name` starts with "Unknown" (case-insensitive) and the existing row already has a non-Unknown `card_name`, keep the existing name/set/year/edition/rarity.

### 3. Make pair-cards propagate identity + trigger re-pricing

In `supabase/functions/pair-cards/index.ts`:
- When pairing a graded card to a raw card, if the graded card's `card_name` is missing or starts with "Unknown", copy `card_name`, `card_set`, `card_year`, `edition`, `rarity` from the raw card onto the graded card.
- Fire-and-forget an `enrich-card` call for the graded card with `knownGrade` (from its existing `grading_company` + `grade_numeric`) so the market value refreshes to graded BGS/PSA/CGC comps.
- On `unpair` do not touch identity.

### 4. Market value shows the graded comp

Once (1)–(3) are in place, `runAnalysis` already biases comps to the confirmed grade (it appends "BGS 8" to the search variant when `knownGrade` is set) and the persisted `estimated_value_low/high` will be the graded eBay range. No new pricing logic is invented — this is the same path `analyze-card` uses.

As a safety net in `enrich-card`: when `knownGrade` is present and the new `estimatedValueLow/High` come back as the tiny AI-only fallback (< $20 for a card that had a much higher `preGradePrediction`), keep the previous value range and mark `softWarning` instead of persisting the fallback. This preserves the collector's number and matches the "never hard-fail a scan" rule already established in the engine.

### 5. Backfill the affected card

Run `enrich-card` once for `28954004-993f-4010-ad7c-721f35bacf65` after the code fix so its `card_name` becomes "Snorlax", `card_set` "Jungle", `card_year` "1999", and `estimated_value_low/high` reflect BGS 8 comps. No SQL data patch — the same code path that runs for future users runs for this row.

## Out of scope

- No changes to `scan-slab` extraction, `AIAccuracyCard`, `CardPairing` UI, Stripe, or any presentation-layer components.
- No new pricing/heuristic logic beyond the safety net in step 4.
- No schema changes.

## Files touched

- `supabase/functions/_shared/analysisEngine.ts` — accept + honor `identityHint`, allow raw image to be added to Claude context when `knownGrade` is set.
- `supabase/functions/enrich-card/index.ts` — load paired raw, pass `identityHint`, guard against "Unknown" overwrite, guard against graded fallback overwrite.
- `supabase/functions/pair-cards/index.ts` — copy identity from raw to graded when graded is Unknown, kick off `enrich-card` with `knownGrade`.
- One-shot `enrich-card` invocation to backfill the current card.
