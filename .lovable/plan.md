## What's wrong (verified against this card)

Snorlax, BGS NM-MT 8, cert 0020586708, paired to a raw scan.

- Stored `estimated_value_low/high` = **$7.83 – $12.38**.
- Yet the same saved analysis holds: eBay sold comps **$175 – $290 (avg $220)**, and `gradedValueEstimates.bgs.valueAtGrade = 220`.
- The analysis text itself says the market rows that were pulled ("$22–30 active, blended ~$10") were **generic BGS 8 listings for unrelated cards**, not this card.

So the headline is showing a number produced by mismatched comps, while the correct graded value already exists in the record. Two separate defects:

1. **Pipeline**: in `_shared/analysisEngine.ts`, Step 4 (Claude × Gemini price verification) and the Step 4.5 uncertainty-widening re-anchor the final value to the blended comp set even when those comps clearly don't match the identified card (low `idCompMatchPct`) and even when a confirmed slab grade is present. The `enrich-card` collapse guard only fires when `newHigh < 20 && prevHigh >= 50`, and the paired raw value was low, so it didn't catch this.
2. **Presentation**: `CardDetail.tsx` feeds `avgValue` (from the DB columns) as `rawValue` to `CardDetailHero`, which always renders a RAW / GRADED toggle — wrong for a card that is a confirmed slab.

## 1. Graded-value trust rule (pipeline)

In `_shared/analysisEngine.ts`, when `knownGrade` is present:

- Compute a **graded anchor** = `gradedValueEstimates[company].valueAtGrade`, else `ebayRecentSales.averagePrice`, else the midpoint of `ebayRecentSales.lowPrice/highPrice`.
- Skip the dual-verifier override (Step 4) when the comp set is untrustworthy for the slab — i.e. `idCompMatchPct` below threshold, or the verified midpoint is less than ~40% of the graded anchor. Keep the verifier note for transparency, but don't let it overwrite the value.
- If the final range still lands far below the graded anchor, restore `estimatedValueLow/High` to `anchor × 0.85 / × 1.15`, and record `valuationSource: "graded_anchor"` plus a plain-language note ("comps pulled did not match this slab; value anchored to graded comps for BGS 8").
- Skip the Step 4.5 uncertainty widening for confirmed slabs — the grade is known, so variant-uncertainty widening only adds noise.

In `enrich-card/index.ts`, broaden the collapse guard: for a `knownGrade` scan, reject a new value that is dramatically below the graded anchor rather than relying on the fixed `<20 / >=50` thresholds.

## 2. Graded-only value UI (presentation)

`CardDetailHero.tsx` — add an optional `confirmedGrade` prop. When present:

- Remove the RAW / GRADED toggle. Replace with tiers for the confirmed grader only: **BGS 8** (confirmed, the default/headline) and **BGS 10** (ceiling), pulled from `gradedValueEstimates[company]` — labels generated from the actual grader and grade, so PSA/CGC/SGC/TAG work identically.
- Headline "Market Value" label reads `BGS 8 · Verified slab` instead of "Raw".
- Chart header uses the same tier labels; the BGS 10 series stays a scaled projection (labelled as a projection, not a comp).
- Non-graded cards keep the existing Raw/Graded behaviour unchanged.

`CardDetail.tsx`:

- Pass `confirmedGrade` (from `analysis.confirmedGrade` or the card's `grading_company` / `grade_numeric` / `condition_grade`) into the hero.
- For graded cards, headline value = graded value resolved with the same precedence as the engine anchor (`valueAtGrade` → eBay average → DB columns), so the page shows $220-ish rather than $10 even before a re-scan.
- Comps list: prefer graded notable sales; drop rows whose title/source is clearly the mismatched generic set when a confirmed grade exists.

`MarketEvidence.tsx`: already shows the "confirmed grade" banner. Extend it so when a mismatch is detected (`idCompMatchPct` low), it shows a soft amber note that the aggregate rows came back for generic listings and the graded comps were used instead — no red failure.

## 3. Repair this card

After the code changes, re-run the graded enrichment for card `28954004-…65` so the stored columns and the analysis agree. No schema change needed.

## Not touched

Stripe, auth, RLS, scan capture flow, PriceCharting catalog matching.
