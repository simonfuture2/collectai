

## Problem

The card detail page uses **mock randomized price history** (`generatePriceHistory`) instead of real data. Meanwhile, the edge functions already extract real eBay and TCGPlayer prices but only pass them to the AI prompt — they're never persisted for historical tracking.

## Plan

### 1. Create a `price_history` table

Store each scan's extracted price data points so we can build real charts over time.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| card_id | uuid | FK to cards.id |
| user_id | uuid | For RLS |
| source | text | 'ebay_sold', 'ebay_active', 'tcgplayer', 'blended' |
| median_price | numeric | Median extracted price |
| low_price | numeric | Min extracted price |
| high_price | numeric | Max extracted price |
| price_count | integer | Number of price points found |
| raw_prices | jsonb | Array of all extracted prices |
| recorded_at | timestamptz | Defaults to now() |

RLS: Users can SELECT/INSERT their own rows (by user_id).

### 2. Update `analyze-card` edge function

After computing the market prices (sold/active/TCG medians), insert rows into `price_history` for each source that returned data, plus a "blended" row with the weighted value. This happens right before the final AI call, using the card_id from the request or after the card is created.

**Challenge**: The card doesn't exist yet when `analyze-card` runs (it's created by the frontend after). So instead, return the structured price data in the response, and have the frontend insert into `price_history` after saving the card.

### 3. Update `Scan.tsx` to persist price history

After inserting the card, take the market price data from the analysis response and insert rows into `price_history` with the new card's ID.

### 4. Update `CardDetail.tsx` to use real data

- Query `price_history` for the card, ordered by `recorded_at`
- If real data exists, show it; if not, fall back to the current mock
- Each re-scan adds new data points, building a real chart over time

### 5. Add a "Re-scan prices" button (lightweight)

On the card detail page, add a button that calls `collectai-price` with the card's info, then inserts new `price_history` rows — building the chart over time without a full re-analysis.

### Files to change

| File | Action |
|------|--------|
| DB migration | Create `price_history` table with RLS |
| `supabase/functions/analyze-card/index.ts` | Return structured `marketPriceData` in response |
| `src/pages/Scan.tsx` | After card insert, persist price history rows |
| `src/pages/CardDetail.tsx` | Query real price_history, replace mock chart data |

### Technical Details

- The `analyze-card` response already returns `ebayRecentSales` and `tcgplayerPrice` but these are AI-generated summaries. We'll add a new `extractedMarketData` field containing the raw computed prices (medians, ranges, raw arrays) from the Firecrawl search step.
- The blended value row uses the existing 50/30/20 weighting formula.
- Price history chart will show the blended median over time, with a tooltip showing the breakdown by source.

