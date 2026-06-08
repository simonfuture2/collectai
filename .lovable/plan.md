# Identification Bake-Off Harness

Admin-only tool to compare card-identification accuracy across three models on cards you've already scanned, with manual ground-truth entry and per-field accuracy scoring.

## ⚠️ Two decisions to confirm before building

1. **Gemini API path.** You asked for "direct API, GEMINI_API_KEY". The rest of the project routes all Gemini through the Lovable AI Gateway (no per-provider key, already-funded, no extra secret). The bake-off works identically either way. I'll default to **Lovable AI Gateway** (no new secret, uses existing `LOVABLE_API_KEY`) unless you say otherwise — if you want the direct Google API you'll need to add a `GEMINI_API_KEY` secret.
2. **Model IDs.** `gemini-3.5-flash` exists in the gateway catalog. `gemini-3.1-pro` does not — the closest match is `google/gemini-3.1-pro-preview`. I'll use that for the "Pro" column. (If using the direct Google API, exact model strings would differ again.)

## What gets built

### 1. New table: `bakeoff_truth`
Stores your manually-entered ground truth per card.

Fields: `card_id` (PK, FK → cards), `card_name`, `card_number`, `card_set`, `card_year`, `variant`, `rarity`, `notes`, plus timestamps.

Access: admin-only (RLS using existing `has_role` / `is_admin` pattern). Grants for `authenticated` + `service_role`.

### 2. New edge function: `id-bakeoff` (`verify_jwt = false`, validates in code)

Endpoints (single function, action-dispatched like `admin-data`):

- `action: "run"` — body `{ cardIds?: string[], limit?: number }`. Admin check → loads cards (filtered list, or all of admin's cards up to `limit`). For each card:
  - Reads the stored `ai_analysis` identification fields → "Claude (current)" column (no new API call, no latency).
  - Signs a short-lived URL for the card image from `card-images` bucket.
  - Calls Gemini 3.5 Flash with the **exact identifyCard system prompt from `analyze-card`** (copied verbatim), measures latency.
  - Calls Gemini 3.1 Pro the same way, measures latency.
  - Parses JSON, returns `{ cardId, image_url, claude, gemini_flash: {result, latency_ms}, gemini_pro: {result, latency_ms}, truth }`.
  - **No credit deduction** anywhere in this path.
- `action: "save_truth"` — body `{ cardId, truth: {...} }`. Admin-only upsert into `bakeoff_truth`.
- `action: "list_results"` — optional, returns cached last-run results if we choose to persist them (see "Persistence" below).

Errors per row are caught and returned in-band so one bad card doesn't kill the batch. Gemini calls run in parallel per card; cards run sequentially (or small concurrency) to avoid rate limits.

### 3. New page: `/admin/id-bakeoff`

- Gated by `useAdmin()` (same hook `/admin` uses); non-admins get redirected.
- Linked from the existing Admin page.
- Controls: "Run on N most recent cards" input + "Run on selected card IDs" textarea + Run button. Loading state with progress.
- Results table, one row per card:
  - Thumbnail + card_id
  - Three model columns, each showing `card_name`, `card_number`, `variant` (other fields in a hover/expand)
  - Latency badge per Gemini column
  - Inline-editable "Verified truth" cells (`card_name`, `card_number`, `variant`, etc.) with Save button → `save_truth`
  - Per-cell ✅/❌ highlighting once truth is entered (exact-match, case-insensitive, trimmed)
- Summary bar above the table, computed client-side from rows that have truth:
  - Per model: overall % match, `card_number` %, `variant` %, avg latency (Gemini only)
  - Total cards scored / total in run

### Persistence decision
Run results are returned in the response and held in page state only (not persisted). Truth entries persist in `bakeoff_truth`. If you later want historical runs saved, that's a small follow-up table — out of scope for v1.

## Files touched

**New**
- `supabase/migrations/<ts>_bakeoff_truth.sql` — table + grants + RLS
- `supabase/functions/id-bakeoff/index.ts` — the function
- `src/pages/admin/IdBakeoff.tsx` — the page
- Route added in `src/App.tsx` (`/admin/id-bakeoff`, lazy-loaded)
- Small link added on `src/pages/Admin.tsx`

**No changes** to `analyze-card`, credits, RLS for `cards`, or any non-admin code path.

## Out of scope
- Pricing model comparison (identification only, per your prompt)
- Auto-grading bake-off
- Bulk import of truth from CSV
- Persisting historical run snapshots