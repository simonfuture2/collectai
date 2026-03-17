

## Problem Analysis

From the edge function logs, I can see two critical issues:

1. **Market data is too sparse**: The latest scan found only 1 eBay sold + 1 eBay active listing, and the previous scan found 0 results across all sources. With so few results, extracted prices are unreliable noise.

2. **Claude verification never ran**: There are no logs showing "Running Claude price verification" — the function either skipped it (empty `marketContext` or missing key) or timed out before reaching Step 4.

3. **AI ignores pricing instructions**: Even when market data IS provided in the prompt, Gemini still outputs $8-$25 because it relies on its training data rather than following the explicit pricing formula in the system prompt.

**Root cause**: The entire pipeline depends on the AI model "obeying" the pricing instructions in the prompt. This is fundamentally unreliable. The fix is to **compute prices programmatically** from market data and **override** the AI's estimate, rather than asking the AI to do math.

## Plan

### 1. Programmatic price override (critical fix)

In `quick-scan/index.ts`, after Step 3 (Gemini analysis), if `quickMarketSearch` returned a blended value, **compute estimated_value_low/high directly from the blended median** instead of trusting the AI:

```
if blended value exists:
  result.estimated_value_low = Math.round(blended * 0.85)
  result.estimated_value_high = Math.round(blended * 1.15)
  result.confidence = 80+
```

This removes dependence on the AI following pricing instructions.

### 2. Deeper market search when sparse (paid analysis fallback)

When the initial Firecrawl search returns < 3 total results, try additional search strategies:
- Remove quotes from search query (currently `"Seismitoad 105/086 Illustration Rare"` — too specific for Firecrawl)
- Try card name + variant only (e.g., `Seismitoad Illustration Rare price`)
- Try TCGPlayer direct URL scrape (`tcgplayer.com/product/...`)
- Add a `pricecheck.gg` or `pokemonprices.com` search as supplementary source

### 3. Fix Claude verification execution

Add diagnostic logging before the Claude check at Step 4 to trace why it's being skipped. Ensure `ANTHROPIC_API_KEY` is available and `marketContext` is non-empty when results exist.

### 4. Add comprehensive logging

Add logs after each step showing:
- Extracted prices from each source (so we can see if $8, $25 are being extracted from noise)
- Whether blended value was computed and what it was
- Whether Claude was attempted and what it returned
- Final values returned to the client

### Files to change

| File | Changes |
|------|---------|
| `supabase/functions/quick-scan/index.ts` | Programmatic price override from blended value, deeper fallback searches, fix Claude verification path, add logging |

### Technical Details

The key change is inserting a price override block between lines 472 and 474:

```typescript
// After parsing Gemini's tool call result (line 472)
const result = JSON.parse(toolCall.function.arguments);

// PROGRAMMATIC OVERRIDE: If we have real market data, use it directly
if (marketContext) {
  // Parse the SUGGESTED VALUE from marketContext
  const suggestedMatch = marketContext.match(/SUGGESTED VALUE: \$([\d.]+)/);
  if (suggestedMatch) {
    const blendedValue = parseFloat(suggestedMatch[1]);
    if (blendedValue > 0) {
      result.estimated_value_low = Math.round(blendedValue * 0.85);
      result.estimated_value_high = Math.round(blendedValue * 1.15);
      result.confidence = Math.min(95, result.confidence + 20);
      console.log(`Programmatic override: blended=$${blendedValue}, range=$${result.estimated_value_low}-$${result.estimated_value_high}`);
    }
  }
}
```

For deeper search, add unquoted fallback queries when total results < 3:

```typescript
// Additional fallback: unquoted, variant-focused
if (totalSpecific < 3) {
  const variantSearch = `${cardId.card_name} ${cardId.variant} price`;
  const [soldVar, activeVar, tcgVar] = await Promise.all([
    doSearch(`${variantSearch} sold site:ebay.com`, 8, "ebay.com"),
    doSearch(`${variantSearch} site:ebay.com`, 6, "ebay.com"),
    doSearch(`${variantSearch} site:tcgplayer.com`, 5, "tcgplayer.com"),
  ]);
  // merge if better
}
```

