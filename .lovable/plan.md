

## Problem

The current eBay search fetches "sold" listings but only gets **titles and descriptions** — it rarely extracts actual **dollar amounts**. The AI sees listing titles like "Charizard Base Set Sold" but no concrete prices, so it still guesses. Additionally, the prompt says "use eBay data as your PRIMARY anchor" but gives no formula for blending sold prices with current listing prices or adjusting for condition.

## Plan

### 1. Add a second Firecrawl search for **active listings** (current asking prices)

Currently only searching `"sold site:ebay.com"`. Add a parallel search for active listings: `"card name set year site:ebay.com"` (without "sold"). This gives both:
- **Recent sold prices** = what cards actually sold for
- **Current listing prices** = what sellers are asking now

### 2. Improve price extraction from Firecrawl results

The current code truncates markdown to 500 chars and dumps it raw. Instead, use a regex pass to extract dollar amounts (`$XX.XX`) from each listing's title/description/markdown before injecting into the prompt. This gives the AI concrete numbers to work with.

### 3. Update the valuation prompt with a clear formula

Replace the vague "use as PRIMARY anchor" instruction with an explicit formula:

```text
VALUATION FORMULA:
1. Extract all dollar amounts from the SOLD listings → compute median sold price
2. Extract all dollar amounts from ACTIVE listings → compute median asking price  
3. Estimated Value = weighted average: 70% recent sold median + 30% active listing median
4. Adjust ±15% based on the card's condition relative to the listings
5. Set estimatedValueLow = estimate × 0.85, estimatedValueHigh = estimate × 1.15
6. If sold data shows a clear price (e.g. $125), your estimate MUST be in that range, not $5-15
```

### 4. Apply to all three edge functions

- **analyze-card/index.ts**: Add active listing search, price extraction helper, updated prompt
- **quick-scan/index.ts**: Same improvements (lighter weight — fewer results)
- **collectai-price/index.ts**: Same improvements

### Technical Changes

**New helper function** (shared pattern in each file):
```typescript
function extractPrices(text: string): number[] {
  const matches = text.match(/\$[\d,]+\.?\d*/g) || [];
  return matches.map(m => parseFloat(m.replace(/[$,]/g, ''))).filter(n => n > 0 && n < 100000);
}
```

**New search** added alongside existing sold search:
```typescript
// Search active listings too
const activeQuery = `${cardName} ${cardSet} ${cardYear} site:ebay.com`;
```

**Updated prompt injection** — instead of raw markdown dumps, inject structured price data:
```text
SOLD LISTINGS (last 30 days):
- Prices found: $125.00, $110.00, $135.00
- Median sold: $125.00
- Range: $110.00 - $135.00

ACTIVE LISTINGS (current):
- Prices found: $149.99, $139.00, $159.99
- Median asking: $149.99

Use these numbers. Your estimated value MUST reflect this data.
```

**Condition matching** — add to the prompt:
```text
Compare the card's condition to what's described in the listings. 
If the card is in better condition, estimate toward the high end. 
If worse, estimate toward the low end.
```

