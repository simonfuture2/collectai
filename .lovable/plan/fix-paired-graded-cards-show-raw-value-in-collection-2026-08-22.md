# Fix: paired graded cards show raw value in Collection

## What's actually wrong

For the BGS 8 Snorlax slab, the stored value columns on the card row are $7.83–$12.38, while its own recent eBay graded comps average $220. The card detail page hides this because it re-resolves the graded value at render time (graded tier value → eBay graded average → stored range). The Collection page does not: it reads the stored value columns directly, so the slab shows ~$10, and the portfolio total, sorting, and CSV export inherit the same wrong number.

The Collection tile also labels grade from `condition_grade` only, so a scanned slab can show a text grade (or nothing) instead of a clear "BGS 8 / Graded" marker.

## Fix

1. Persist the graded value, so every screen agrees
   - When a slab is confirmed (scan-slab / pair-cards / enrich-card completion), write the resolved graded value into the card's stored value range instead of leaving the collapsed raw range.
   - One-time backfill for existing confirmed slabs whose stored range is far below their graded comps (the Snorlax case), using the same precedence already used on the detail page.

2. Shared resolution helper
   - Extract the detail page's slab-value precedence into a small shared helper and use it in both places, so there is one rule: grader-tier value at grade → eBay graded average → eBay low/high midpoint → stored range.

3. Collection presentation
   - Include the grading fields already needed and show a "Graded · BGS 8" badge on the tile/row for confirmed slabs (falling back to `condition_grade` for non-slabs).
   - Value shown on the tile, in the list row, in the portfolio total, in value sorting, and in CSV export all use the resolved graded value.

## Technical notes

- Files: `src/pages/Collection.tsx`, `src/pages/CardDetail.tsx`, new `src/lib/cardValue.ts` (shared helper), `supabase/functions/pair-cards/index.ts` and `supabase/functions/enrich-card/index.ts` for the persisted write, plus one data backfill for existing confirmed slabs.
- No changes to the identification pipeline, `analysisEngine.ts` scoring, pricing sources, or Stripe.
- Backfill only raises values where a confirmed grade exists and graded comps clearly contradict the stored range; nothing else is touched.
