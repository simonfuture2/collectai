## What's actually happening on this card

I pulled the row for `d00c5d76…` from the database. The picture is clearer than it looks in the UI:

- `analysis_status = complete`, identification ran fine (`Michael Jordan / SkyBox Premium`, condition assessed).
- `estimated_value_low` and `estimated_value_high` are both **NULL**, so the "Estimated Value" tile shows `$0 - $0`.
- `ebay_recent_sales` exists but every price field is null and `recentSalesCount: 0` — i.e. the live market search returned nothing useful for this card.
- `ai_analysis` contains only 5 keys: `dataSource`, `estimatedValueLow/High` (null), `lastRescanData`, `noMarketData`. All identification, condition, grading-value, factors, outlook fields are gone.

That last point is the real bug. The original `enrich-card` run writes a full analysis object (identification + condition + pricing). The **"Re-Scan Prices"** button in `CardDetail.tsx` then rewrites `ai_analysis` and, on a no-data response, effectively flattens it to just the pricing wrapper. So every time the user hits rescan on a card that has no fresh market data, the rich AI analysis disappears from the UI.

## Fix plan

### 1. Stop `rescanPrices` from destroying existing analysis
`src/pages/CardDetail.tsx` (`rescanPrices`):
- Only enter the "update card" branch when there's *real* new data (`blended` is non-null OR at least one source has prices).
- Never overwrite top-level identification/condition fields. Write only a `pricingUpdate` sub-key + refreshed `estimatedValueLow/High`, merged on top of the existing `ai_analysis`.
- If the rescan returns no data, show a toast ("No fresh market data found — keeping previous values") and leave the row untouched.

### 2. Make `collectai-price` safe-by-default
`supabase/functions/collectai-price/index.ts`:
- When the function has no usable prices, return `{ ok: true, noData: true }` instead of an empty `extractedMarketData` shell, so the client can branch cleanly.
- Never instruct the client to clear fields.

### 3. Add a real "Re-analyze" action (full pipeline)
Right now the only recovery for a card with missing analysis is "Retry" — and it's only shown when `analysis_status === 'failed'`. This card is `complete`, so the user has no way out.
- Add a secondary button next to "Re-Scan Prices" called **"Re-run full analysis"** that:
  - Sets `analysis_status = 'pending'` on the row.
  - Invokes `enrich-card` with the existing `cardId` + stored image, re-running identification, condition, market search, and pricing.
- Surface it whenever `estimated_value_low` is null OR `ai_analysis` is missing core keys (`cardName`/`conditionGrade`).

### 4. One-time repair for this specific card
After the fix ships, trigger `enrich-card` once for `d00c5d76-0afb-41ea-80a4-eef1822f3dc4` so the user immediately sees a populated analysis again (no manual click needed for the broken card they're staring at).

### 5. Defensive UI rendering
In `CardDetail.tsx`, when `estimated_value_low/high` are null but `analysis_status === 'complete'`, show "Market value unavailable — try Re-run full analysis" instead of `$0 - $0`. This prevents the "blank screen" feeling even if a future rescan fails.

## Files touched
- `src/pages/CardDetail.tsx` — guard rescan, add "Re-run full analysis" button, friendlier empty state.
- `supabase/functions/collectai-price/index.ts` — explicit `noData` response, never clear fields.
- (No schema changes.)

## Out of scope
- Reworking the Gemini pricing prompt or Firecrawl market search — those are a separate effort. This plan stops the data loss and gives the user a working recovery path.