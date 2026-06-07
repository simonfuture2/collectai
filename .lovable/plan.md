## Why only PSA shows today

I checked the card on screen (`4e084d20…`, a Dragon Ball TCG). The AI only returned a full `psa` pricing block plus an `otherGraders` object with bare estimated grades for BGS/CGC/SGC — no `valueAtBGS10`, `valueAtCGC10`, etc. The UI in `CardDetail.tsx` only renders a grader card when its `valueAtX10` fields exist, so BGS/CGC/SGC silently drop and the user sees PSA alone.

Root cause is the pricing schema in `supabase/functions/enrich-card/index.ts` (lines ~227–235): it explicitly asks for full data only for PSA and a stub for the rest.

## What to change

### 1. Enrich-card prompt + schema (`supabase/functions/enrich-card/index.ts`)
Replace the `otherGraders` stub with full per-grader blocks, and make the set category-aware:

- TCG (Pokémon, Magic, Yu-Gi-Oh, Dragon Ball, One Piece, etc.): `psa`, `cgc`, `bgs`, `tag`
- Sports: `psa`, `cgc`, `bgs`, `sgc`
- Other categories: `psa`, `cgc`, `bgs` as a sensible default

Each block returns: `estimatedGrade`, `valueAtGrade`, `valueAt<X>10`, `valueAt<X>9_5` (where applicable), `valueAt<X>9`, `gradingCost`, `turnaroundTime`. Also expand `recommendedGrader` enum to include `"TAG"`. Add a one-line instruction: "Populate every grader listed for this category, even if values are estimates; only set a grader to null if it does not grade this category."

Mirror the same schema update in `supabase/functions/analyze-card/index.ts` (the alternate analysis pipeline already lists psa/bgs/cgc/sgc — add `tag` conditionally and the same category rule).

### 2. UI rendering (`src/pages/CardDetail.tsx`)
- Add a `tag` interface block (mirrors `cgc` shape: `valueAtTAG10`, `valueAtTAG9_5`, `valueAtTAG9`).
- Replace the four hard-coded grader cards (lines ~836–893 and the duplicate at ~1327–1384) with a single loop that:
  - Builds a grader list from `card.category` (TCG → PSA/CGC/BGS/TAG, Sports → PSA/CGC/BGS/SGC, else PSA/CGC/BGS).
  - Skips a grader only when none of its `valueAt…` fields are present.
  - Renders in the existing card style; CGC gets a distinct color for sports so it reads as "the sports option".
- Update the `recommendedGrader` type to include `"TAG"` and the legend at line ~1611 to be category-driven.

### 3. Backfill prompt for older cards
No migration needed. Cards already saved will keep showing only PSA until a re-run; the existing "Re-run full analysis" button on `CardDetail` already covers recovery. Optionally trigger it automatically (one-shot) when a card's `gradedValueEstimates` contains the legacy `otherGraders` shape — small effect, low risk.

## Files touched
- `supabase/functions/enrich-card/index.ts` — expanded grader schema, category-aware list, TAG support.
- `supabase/functions/analyze-card/index.ts` — same schema expansion.
- `src/pages/CardDetail.tsx` — TAG type, category-driven grader rendering loop, optional auto-re-run for legacy shape.

## Out of scope
- Pulling live pop reports from CGC/BGS/TAG APIs.
- Per-grader real market sales (still AI-estimated based on PSA anchor).
- Changing the condition / pre-grading scorecards.
