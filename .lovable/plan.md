## Goal

Split the scan flow into two phases so the user never sits on the Scan page waiting on the long pricing/verify pipeline. They snap a photo, the card is identified and saved to their collection in ~5–15s, then they're taken to the card detail page where the full AI analysis (market search, valuation, verification) streams in afterward.

## Current flow (the problem)

```text
Upload → analyze-card edge function does ALL of this in one request:
  1. Claude identify (~5–15s)
  2. Firecrawl market search (15–80s)
  3. Claude price analysis (~10–20s)
  4. Cross-verify Claude + Gemini (~10–25s, fast scan skips)
  5. Save card row
  6. Save price_history, deduct credit
  → returns cardId
User waits 60–250+s on the Scan page with a spinner.
```

## New flow (two phases)

```text
PHASE 1 — Quick identify (Scan page, blocking ~5–15s)
  Upload images
   └─ identify-card edge function
        ├─ Claude vision identify only
        ├─ Insert cards row with analysis_status = 'analyzing'
        ├─ Deduct credit
        ├─ Fire-and-forget invoke of enrich-card (no await)
        └─ Return { cardId } immediately
  Client navigates to /card/:cardId

PHASE 2 — Enrichment (runs in background, CardDetail page)
  enrich-card edge function
    ├─ Firecrawl market search (respects fastScan flag)
    ├─ Claude price analysis
    ├─ Cross-verify (skipped if fastScan)
    ├─ UPDATE cards row with full analysis + analysis_status = 'complete'
    └─ INSERT price_history rows
  CardDetail page subscribes via Supabase realtime (or polls every 3s)
    ├─ Shows card photo + identification immediately
    ├─ Shows skeleton/"Analyzing market…" placeholders for pricing
    └─ Animates values in when status flips to 'complete'
```

## Changes

### Database (one migration)
Add to `public.cards`:
- `analysis_status TEXT NOT NULL DEFAULT 'complete'` — values: `pending`, `analyzing`, `complete`, `failed`
- `analysis_error TEXT NULL`
- `analysis_started_at TIMESTAMPTZ NULL`
- `analysis_completed_at TIMESTAMPTZ NULL`

Enable realtime on `public.cards` (ALTER PUBLICATION supabase_realtime ADD TABLE).

### Edge functions

**New: `supabase/functions/identify-card/index.ts`**
- Auth + credit check (same as analyze-card today).
- Call Claude vision identify only.
- Insert `cards` row with the identification fields + `analysis_status='analyzing'`.
- Deduct credit, write `credit_transactions`.
- Trigger background enrichment: call `supabase.functions.invoke('enrich-card', { body: { cardId, images, fastScan } })` **without awaiting** (or wrap in `EdgeRuntime.waitUntil`). Don't block on the response.
- Return `{ cardId }` in one round trip.

**New: `supabase/functions/enrich-card/index.ts`**
- Service-role client (no user JWT needed — invoked server-to-server, but still validate the cardId belongs to a real user_id).
- Run the existing market search + price analysis + (optional) cross-verify pipeline lifted from `analyze-card/index.ts`. Respects `fastScan`.
- On success: `UPDATE cards SET ai_analysis=…, estimated_value_low=…, … , analysis_status='complete', analysis_completed_at=now() WHERE id=cardId`.
- Insert `price_history` rows.
- On failure: `UPDATE cards SET analysis_status='failed', analysis_error=<message>`.

**Keep `analyze-card` temporarily** as a thin wrapper that calls identify + waits for enrich (for the "Re-Scan & Update Prices" button on CardDetail), OR refactor that button to call enrich-card directly. Recommended: refactor CardDetail's `rescanPrices` to call `enrich-card` with the existing cardId, then delete the legacy analyze-card path in a follow-up.

### Frontend

**`src/pages/Scan.tsx`**
- Replace the single `supabase.functions.invoke('analyze-card', …)` with `invoke('identify-card', …)`.
- Remove the client-side fallback save block (no longer needed — identify-card always saves).
- As soon as `{ cardId }` returns, `navigate('/card/' + cardId)`.
- Update `ScanTimeline` to reflect the shorter pipeline (just "Uploading → Identifying → Saving").
- Keep the Fast Scan toggle; pass `fastScan` so enrich-card knows.

**`src/pages/CardDetail.tsx`**
- On mount, read the card. If `analysis_status === 'analyzing'`:
  - Show skeleton shimmer for valuation / market sections.
  - Show a top banner: "AI analysis in progress — refreshing automatically".
  - Subscribe to `postgres_changes` for `cards` filtered by `id=eq.<cardId>`. On UPDATE with status `complete`, replace state and remove skeleton. On `failed`, surface an error with a "Retry analysis" button that calls `enrich-card`.
  - Fallback: also poll every 4s in case realtime drops.
- Existing identification fields (name, set, year, image, category) render immediately.

## Technical details

- **Don't block identify-card on enrich-card.** Use `EdgeRuntime.waitUntil(supabase.functions.invoke('enrich-card', …))` or a fetch to the function URL without awaiting. This is the key to the fast return.
- **Credit handling:** charge the credit in identify-card (the user got the card identified and saved). If enrichment fails, the "Retry analysis" button on CardDetail re-runs enrich-card without a new charge.
- **RLS:** enrich-card uses service role to update; no policy change needed beyond existing card ownership checks (we validate cardId→user_id inside the function).
- **Realtime:** the `cards` table needs `REPLICA IDENTITY FULL` and to be added to the `supabase_realtime` publication so UPDATE payloads carry the full row.
- **Backward compat:** existing cards default to `analysis_status='complete'` so the new skeleton logic never triggers for them.

## Out of scope

- Visual redesign of CardDetail skeletons (use existing skeleton components).
- Push notifications when analysis completes (could be a follow-up if the user closes the tab).
- Reworking quick-scan / demo-scan flows.