

# Fix: Re-Scan Updates Card Values + Add "Last Scanned" Date + 1 Free Daily Rescan

## Problems
1. **Re-scan doesn't update displayed values**: The `rescanPrices` function calls `collectai-price` which returns new market data, but the code never updates the card's `estimated_value_low`, `estimated_value_high`, or `ai_analysis` in the database. The old $5500 value persists.
2. **No "last scanned" date**: Users can't see when a card was last analyzed.
3. **No free daily rescan**: Every rescan currently requires credits or Pro.

## Solution

### 1. Database migration — add `last_scanned_at` column
- Add `last_scanned_at timestamptz DEFAULT now()` to the `cards` table
- Backfill existing cards with their `updated_at` value

### 2. Fix `rescanPrices` in `CardDetail.tsx` to actually update the card
After `collectai-price` returns new data with blended prices:
- Compute new `estimated_value_low` and `estimated_value_high` from the blended market data
- Update the `cards` row: set `estimated_value_low`, `estimated_value_high`, `last_scanned_at = now()`, and merge new pricing info into `ai_analysis`
- Refresh local state so the UI reflects new values immediately
- Show the "Last scanned" date next to the condition badge

### 3. Add 1 free daily rescan logic
- Before calling `collectai-price`, check `last_scanned_at` on the card
- If the card was last scanned more than 24 hours ago, the rescan is free (no credit check)
- If scanned within 24 hours, require credits/Pro as usual
- Display "Free daily rescan available" or "Uses 1 credit" on the button

### 4. Display "Last Scanned" date on card detail
- Show below the condition grade: "Last scanned: Mar 26, 2026"
- Update after each rescan

## Files to edit
1. **New migration** — add `last_scanned_at` column to `cards`
2. **`src/pages/CardDetail.tsx`** — fix `rescanPrices` to update card values in DB + state, add last-scanned display, add free daily rescan logic
3. **`supabase/functions/analyze-card/index.ts`** — set `last_scanned_at` on initial card insert (already sets `created_at`, just need to include the new column)

## Technical details
- The blended market data from `collectai-price` contains `extractedMarketData.blended.low` and `.high` — use these directly as the new value range
- Card update uses `supabase.from("cards").update(...)` which is allowed by the existing "Users can update their own cards" RLS policy
- Free daily rescan: compare `card.last_scanned_at` to `Date.now() - 86400000` on the client side (no edge function change needed since `collectai-price` doesn't deduct credits — it's a price-only endpoint)

