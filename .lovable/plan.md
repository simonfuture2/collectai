## Diagnosis

The current split did not make the scanner feel faster because the Scan page still blocks on a Claude vision identification call before saving/opening the card. That call can still be slow, and the background enrichment path can also be unreliable because it depends on a long function continuing after the response.

Also, the Scan UI still shows the old timeline language: Identify → Search → Verify, which makes it look like the user is waiting on the full old pipeline even after the attempted split.

## Goal

Make scan feel successful within seconds:

```text
Upload photo → create card row immediately → open card detail
             → identify + price run in background
             → card detail updates as each stage finishes
```

## Plan

### 1. Make the Scan page stop waiting for AI
- After images upload, call a new lightweight start function that only:
  - authenticates the user
  - validates credits
  - saves the card image path
  - creates the card row immediately with `analysis_status = 'pending'`
  - deducts credit
  - starts the AI job in the background
  - returns `cardId` right away
- Navigate to `/card/:cardId` as soon as the row is created.
- Replace the current Scan timeline with a short “Uploading / Saving / Opening” flow, not “Search / Verify”.

### 2. Move identification into the background job
- Refactor the background function so it can handle cards that do not have identification yet.
- The job will run in stages:
  1. `identifying` — read card name, set, number, year
  2. `pricing` — market lookup and value estimate
  3. `complete` — save full analysis
  4. `failed` — store an actionable error
- Update the card row after identification completes so the detail page can show the card name before pricing finishes.

### 3. Make background execution reliable
- Avoid depending only on nested fire-and-forget behavior.
- Have the start function invoke the background processor and immediately return after dispatching.
- Add explicit status/error writes so users never get stuck on an endless spinner.
- Add practical timeouts around market search / AI calls so one slow provider cannot stall the job forever.

### 4. Update Card Detail for progressive results
- Show the uploaded image immediately, even before identification finishes.
- Display stage-specific banners/placeholders:
  - “Identifying card…”
  - “Pricing from market data…”
  - “Analysis complete”
  - “Analysis failed — retry”
- Keep realtime subscription plus polling, but ensure it reloads the image/title/pricing when each stage updates.

### 5. Keep pricing accurate without blocking UX
- Fast Scan should use a limited pricing pass first, then optionally enrich deeper afterward.
- Front-only scans should still identify and price; grading confidence should be clearly lower until a back image is added.
- Cross-verification should not block the first useful valuation.

### 6. Clean up old/confusing paths
- Remove or bypass old blocking scanner logic from the main Scan route.
- Keep legacy functions only where still needed, but do not let the main scanner call the old all-in-one pipeline.
- Update any scan-related UI copy that still implies a 25–40 second wait on the Scan page.

## Technical details

- Add/expand `analysis_status` values: `pending`, `identifying`, `pricing`, `complete`, `failed`.
- Reuse the existing `cards` table and storage bucket.
- Do not manually edit generated backend type files.
- Use Lovable Cloud functions for the scan orchestration.
- Add logging around each stage so future slowdowns can be diagnosed by function/stage instead of guessing.

## Expected result

The user should leave the Scan page almost immediately after upload. The detail page becomes the “analysis in progress” screen, so the app feels responsive even when AI pricing takes longer.