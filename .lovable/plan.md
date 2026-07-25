## Problem

Snorlax card (`28954004-…`) has `is_authenticated: false`, no `grading_company`, and no `scan-slab` invocations in edge-function logs. You expect that tapping **Scan slab photo** and uploading a slab image populates the Authenticated Profile, AI Accuracy card, and confirmed-grade market comps — but nothing appears.

Because zero calls have reached `scan-slab` yet, the failure is upstream of the AI pipeline. The fix has to start with an end-to-end reproduction to find where the flow breaks (button → storage upload → `supabase.functions.invoke("scan-slab")` → DB update → UI refresh).

## Investigation (first, no code changes)

1. Repro in the live preview using Playwright: open this card, tap **Scan slab photo**, upload a fixture slab image, capture console + network + screenshots.
2. Confirm which step fails:
   - Storage upload to `card-images` succeeds?
   - `scan-slab` invocation returns 2xx / 4xx / 5xx?
   - `scan-slab` logs show extract confidence, grade, cert?
   - Card row is updated (`is_authenticated`, `grading_company`, `ai_analysis.confirmedGrade`, `ai_analysis.gradeAccuracy`)?
   - `enrich-card` re-run kicks off with `knownGrade`?
   - UI reloads and renders `AuthenticatedProfile` + `AIAccuracyCard`?

## Likely root causes (to be confirmed by the repro above)

- `scan-slab` was never deployed after being added — invoke returns "function not found".
- Vision extract returns `confidence < 0.5` on real slab photos, so the function 422s and nothing is written — thresholds too strict.
- `window.location.reload()` fires before the fire-and-forget `enrich-card` finishes, so the UI shows the grade but not refreshed market comps for the graded tier.
- `AIAccuracyCard` only renders when `analysis.gradeAccuracy` exists — if this is the first scan there is no snapshot to compare against and we currently only show a "no prior AI grade to compare" verdict, which may look empty.
- Frontend gates on `hasSlab = grading_cert_number && grading_company`, so if the slab has no visible cert number the profile keeps showing the empty state even after a successful scan.

## Fix plan (executed in build mode after the repro pins the cause)

1. **Deploy check**: ensure `scan-slab` is live; if not, redeploy.
2. **Loosen the reject bar** in `supabase/functions/scan-slab/index.ts`: accept when `company` + `numeric` are present even if `cert_number` is missing or confidence is 0.4–0.5, and return a soft-warning payload instead of a 422 so the user sees *something*.
3. **Fix the profile gate** in `src/components/AuthenticatedProfile.tsx`: treat `is_authenticated || grading_company` as "has slab", not `grading_cert_number && grading_company`.
4. **Show the scorecard on first scan** in `src/components/AIAccuracyCard.tsx`: render a "First graded scan — baseline saved" state when `hasComparison=false` so the card is visible instead of hidden.
5. **Refresh UX**: replace the hard `window.location.reload()` in `AuthenticatedProfile` with a query re-fetch + a toast when `enrich-card` completes (poll `cards.updated_at` or subscribe), so graded comps appear without a page flash.
6. **Verify** with Playwright: repeat the slab upload, screenshot the card detail page, confirm Authenticated Profile, AI Accuracy card, and the "confirmed grade" badge on Market Evidence all render.

## Out of scope

Analysis engine (`analysisEngine.ts`), pricing logic, Stripe, unrelated pages.