

# Fix: Inaccurate AI-Only Valuations When Market Data is Missing

## Root Cause

When Firecrawl returns zero market listings (which happens with sports cards that aren't on TCGPlayer, or when search queries don't match eBay listing titles), the AI has no price anchor. Claude falls back to training data which can produce wildly inaccurate values (e.g., $5500 for a common Kobe Bryant base card). The system prompt says "be conservative" but doesn't enforce any guardrails.

## Two-Part Fix

### 1. Improve market search for sports cards
The current search builds queries optimized for TCG cards (card number, variant). Sports cards need different search terms — player name + year + set is more effective on eBay, and TCGPlayer is irrelevant for sports cards. The `buildSearchTerms` function should adapt based on the identified card category.

### 2. Add contingency when zero market data is found
When no market data exists, the system should:
- Force confidence to `"low"` regardless of what Claude returns
- Add a `noMarketData: true` flag in the response
- Instruct Claude to return a **wide range** (e.g., ±50%) and explicitly state values are unverified
- Cap AI-only estimates at reasonable thresholds unless the card is clearly identifiable as high-value
- Show a prominent warning in the UI on the CardDetail page

## Changes

### File: `supabase/functions/analyze-card/index.ts`

**A. Improve `buildSearchTerms` for sports cards**
- Add a `category` parameter (from Step 1 identification)
- For sports cards: use `"player name year set"` format, skip card_number in the query
- Add a third search tier: try the card name alone as ultimate fallback if specific + broad both fail

**B. Add post-analysis guardrails when `marketData.hasData === false`**
After parsing the analysis JSON (around line 661):
- Force `analysis.confidence = "low"`
- Set `analysis.noMarketData = true`
- Set `analysis.confidenceReason` to explain no real-time data was found
- If `estimatedValueHigh > 500` and no market data, add a flag `analysis.valuationWarning = "High value estimated without market verification — treat as rough estimate"`
- Widen the range: set low to `estimatedValueLow * 0.5`, high to `estimatedValueHigh * 1.5` to communicate uncertainty

**C. Strengthen the no-market-data system prompt section**
Update the fallback prompt (line 506) to be more explicit:
- "If you cannot confidently identify the exact card variant, assume it is a common/base version"
- "For sports cards without market data, estimate conservatively — most raw base cards are $1-$20 unless they are rookies, autos, or numbered parallels"
- "Never estimate above $100 without market data unless the card is clearly a rare insert, autograph, or serial-numbered parallel"

### File: `src/pages/CardDetail.tsx`

**D. Show warning banner when `noMarketData` is true**
- Check `card.ai_analysis?.noMarketData` or `card.ai_analysis?.confidence === "low"`
- Display a yellow/amber alert banner below the value stats: "⚠️ Values estimated without live market data — actual prices may differ significantly. Re-scan to check for updated pricing."
- Include a quick link to the Re-Scan button

## Files to edit
1. `supabase/functions/analyze-card/index.ts` — search improvements + guardrails
2. `src/pages/CardDetail.tsx` — warning banner for low-confidence valuations

