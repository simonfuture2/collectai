

## Problem Diagnosis

The quick scan returned `$5-$20` for a Seismitoad 105/086 Illustration Rare worth ~$100-$130. From the edge function logs, we can see:

1. **Step 1 identified the card as just "Seismitoad" in "BLK IN"** — too vague. It missed the card number (105/086), the variant type (Illustration Rare), and the full set name.
2. **With that vague search term, Firecrawl likely found generic Seismitoad cards** (common versions worth $1-5) instead of the specific Illustration Rare.
3. **The AI then either got no useful market data or got prices for the wrong card**, falling back to training knowledge which gave a generic low estimate.

The root cause is a **garbage-in, garbage-out problem**: vague identification → wrong search terms → wrong prices → wrong estimate.

Additionally, the user wants **Claude as the primary AI for pricing verification** to improve accuracy.

## Plan

### 1. Fix Card Identification (Critical)

Update the identification prompt in both `quick-scan` and `analyze-card` to extract **much more specific** details:
- Full card number (e.g., "105/086")
- Variant/parallel type (e.g., "Illustration Rare", "Alt Art", "Full Art")
- Language, finish type (holo, reverse holo)
- Use `google/gemini-2.5-pro` instead of `flash` for identification — it's more accurate for reading small text on cards

The tool call schema will add: `card_number`, `variant`, `rarity` fields to the identification step.

### 2. Improve Search Queries

Update `quickMarketSearch` (in quick-scan) and `searchMarketPrices` (in analyze-card) to build **much more specific** search queries:
- Include card number and variant in the search term (e.g., `"Seismitoad 105/086 Illustration Rare" sold site:ebay.com`)
- Use quotes around the card name for exact matching
- Add a fallback: if the specific search returns no results, try a broader search

### 3. Filter Extracted Prices Better

The current `extractPrices` regex grabs every dollar amount on the page, including shipping costs, seller ratings, etc. Improve by:
- Filtering out obvious noise (prices under $1, shipping amounts like "$4.99 shipping")
- Using IQR-based outlier removal to discard prices that are clearly for a different card/condition
- Weighting prices closer to the median more heavily

### 4. Add Claude as Primary Pricing Verifier

Since the user wants Claude as the primary AI:
- Need to set up an `ANTHROPIC_API_KEY` secret
- Create a direct Claude API call in the edge functions for price verification
- Use Claude (claude-sonnet-4-20250514) as the **primary verifier** that cross-checks and corrects the Gemini estimate against raw market data
- Fall back to Gemini verification if Claude is unavailable

### 5. Upgrade Quick Scan Model

Switch the quick scan's final analysis call from `gemini-2.5-flash` to `gemini-2.5-pro` for better accuracy, since the user chose "accuracy first."

### Files to Change

| File | Changes |
|------|---------|
| `supabase/functions/quick-scan/index.ts` | Better identification (add card_number, variant, rarity to ID step), improved search queries with specifics, better price filtering, upgrade to gemini-2.5-pro, add Claude verification step |
| `supabase/functions/analyze-card/index.ts` | Same identification improvements, fix `ebayData` reference on line 538 (currently undefined variable), add Claude verification |
| `supabase/functions/collectai-price/index.ts` | Improved search queries, add Claude verification |

### Setup Required

Before implementing, we need the user to provide an **Anthropic API key** for Claude access. We'll use the `add_secret` tool to request `ANTHROPIC_API_KEY`.

### Key Technical Details

**Better identification schema:**
```typescript
properties: {
  card_name: { type: "string", description: "Full character/player name" },
  card_number: { type: "string", description: "Card number e.g. 105/086" },
  card_set: { type: "string", description: "Full set/series name" },
  card_year: { type: "string" },
  variant: { type: "string", description: "Variant type: Illustration Rare, Full Art, Alt Art, Holo, Regular, etc." },
  rarity: { type: "string", description: "Rarity level" },
}
```

**Better search query construction:**
```typescript
// Specific: "Seismitoad 105/086 Illustration Rare" sold site:ebay.com
// Fallback: Seismitoad "Black Bolt" Illustration Rare sold site:ebay.com
```

**Outlier filtering for extracted prices:**
```typescript
function filterOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices;
  const sorted = [...prices].sort((a,b) => a-b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return prices.filter(p => p >= q1 - 1.5*iqr && p <= q3 + 1.5*iqr);
}
```

**Claude verification call:**
```typescript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: verificationPrompt }],
  }),
});
```

**Also fixing the bug on line 538 of analyze-card:** The system prompt references `ebayData.summary` which is undefined — should be `marketData.summary`.

