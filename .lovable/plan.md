# Slab-scan verification & AI accuracy scorecard

Today the "Authenticated Profile" block only appears when a slab cert or AuthentiSeal serial is entered manually. The condition grade shown on the card still comes from the pre-grade AI scan (e.g. "Graded 8 NM-MT" that isn't real), and Market Evidence still shows raw comps. When the user uploads a photo of the graded slab, MyCollectAI should:

1. Read the actual grade + grader + cert number off the slab label with vision AI.
2. Overwrite the card's grade with the authoritative slab result and mark it verified.
3. Refresh Market Evidence so comps are for the confirmed grade, not the raw guess.
4. Snapshot the original pre-grade AI prediction and score how close the AI was.

## User flow

On any card detail, add a **"I got this graded — scan the slab"** action inside `AuthenticatedProfile`:
- Opens the existing camera/upload flow, expects 1–2 photos of the slab (front required, back optional for cert).
- Uploads to `card-images` storage under the same card id.
- Calls a new edge function `scan-slab` which runs vision, updates the row, refreshes pricing for the graded tier, and returns an accuracy scorecard.
- UI swaps in the Authenticated Profile with a green "Verified from slab photo" badge; Market Evidence re-renders with graded comps; a new **"AI vs Reality"** card appears showing the scorecard.

Manual cert entry stays as a fallback.

## Backend

**New edge function `supabase/functions/scan-slab/index.ts`**
- Auth: user JWT; verifies `cards.user_id = auth.uid()`.
- Input: `{ cardId, images: [{label,url}] }`.
- Step A — vision extract via Lovable AI Gateway (`google/gemini-3.5-flash`, JSON mode). Prompt asks for: `grading_company` (PSA/BGS/CGC/SGC/TAG/AuthentiSeal/Other), `grade_label` (raw string on the slab, e.g. "NM-MT 8"), `grade_numeric`, `subgrades` (centering/corners/edges/surface if BGS), `cert_number`, `card_name`, `card_year`, `card_set`, `confidence` (0–1). Reject with a soft warning if `confidence < 0.5` or no grade found.
- Step B — snapshot the pre-grade AI prediction *before* overwriting. Read the current `cards` row and copy `condition_grade`, `grade_numeric`, `ai_analysis.gradingEdge`, `estimated_value_low/high` into `ai_analysis.preGradePrediction` (only if not already set — first-scan wins so re-scans don't clobber history).
- Step C — persist authoritative fields on `cards`: `grading_company`, `grading_cert_number`, `grade_numeric`, `condition_grade` (= slab `grade_label`), `is_authenticated=true`, `authenticated_at=now()`, `authentication_data = { source: 'slab_scan', extracted, images, scanned_at }`.
- Step D — refresh market evidence for the confirmed grade by re-running the shared engine narrowed to the graded tier. Reuse `runAnalysis` from `_shared/analysisEngine.ts` with `category` and a new optional `knownGrade: { company, numeric }` hint so pricing/comps target the graded tier (analysisEngine already produces graded comps; we only need to pass the hint through and prefer graded results for the summary values when present).
- Step E — compute accuracy scorecard and store under `ai_analysis.gradeAccuracy`:
  - `predictedGrade` (from snapshot), `actualGrade` (from slab), `deltaGrades = actual - predicted`, `withinHalf` / `withinOne`, and a 0–100 `accuracyScore` (100 if exact, −20 per half-grade off, floor 0).
  - `predictedValueMid` vs `actualValueMid` and `valueDeltaPct`.
  - `verdict`: "Spot on" | "Very close" | "Off by a grade" | "Way off".
- Response: `{ ok, extracted, accuracy, refreshedAnalysis }`.

**Edge function config**: no change to `supabase/config.toml` needed (default verify_jwt).

**No schema migration required** — reuses existing columns (`is_authenticated`, `authentication_data`, `grading_company`, `grading_cert_number`, `grade_numeric`, `condition_grade`, `ai_analysis` jsonb).

## Frontend

**`src/components/AuthenticatedProfile.tsx`**
- Add primary button **"Scan slab photo"** (camera icon) alongside "Add slab cert". Opens a lightweight upload sheet (reuse the pattern from `Scan.tsx` — file input + camera capture, upload to `card-images/{userId}/{cardId}/slab-*`).
- On success, show `reachable`-style green confirmation "Verified from slab photo · {company} {grade}" and call `onUpdated()`.
- When `authentication_data.source === 'slab_scan'`, show a small "Verified from photo" chip instead of the manual-entry look.

**New `src/components/AIAccuracyCard.tsx`**
- Rendered on `CardDetail` only when `ai_analysis.gradeAccuracy` exists.
- Two-column comparison: "AI predicted" vs "Actual slab". Big number for each grade, colored delta pill, one-line verdict, and a horizontal accuracy bar (0–100).
- If value delta available, second row: "AI value estimate" vs "Graded market value" with % delta.

**`src/components/MarketEvidence.tsx`**
- No structural change — it already reads from `ai_analysis`. Because `scan-slab` refreshes analysis with the known-grade hint, graded comps naturally take priority. Add a subtle "Confirmed grade: {company} {grade}" badge at the top of the section when `is_authenticated && grading_company` are set, so the user knows the evidence reflects the real grade.

**`src/pages/CardDetail.tsx`**
- Mount `<AIAccuracyCard />` below `<AuthenticatedProfile />`.
- Hide/soft-mute the pre-grade "Should I grade this?" ladder (`GradeLadder` / `PreGradingAnalysis`) once `is_authenticated` is true (that question is answered).

## Verification

- On the Snorlax card currently on screen: tap "Scan slab photo", upload a slab image → Authenticated Profile flips to "Verified from photo · PSA 8", Market Evidence header shows the confirmed-grade badge and comps update to graded sales, and the "AI vs Reality" card shows predicted vs actual with an accuracy score.
- Re-scanning the same slab does not overwrite `preGradePrediction` (first snapshot is preserved).
- Manual cert entry still works and does not require a slab photo.

## Out of scope

`analysisEngine.ts` pricing internals, Stripe, auth, and the scan pipeline for raw cards. The only engine change is threading an optional `knownGrade` hint through so refreshed comps target the confirmed tier.
