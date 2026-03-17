

## Problem

The AI is returning wildly inaccurate value estimates (e.g., $5-15 when eBay sold comps are $125) because:

1. **No real-time data**: Both `analyze-card` and `quick-scan` rely purely on the AI model's training data for pricing — the model has no access to current market data and its knowledge cutoff means prices are stale or hallucinated.
2. **No grounding instruction**: The prompts don't tell the AI to account for today's date or emphasize using the most current data possible.
3. **No web search**: The system never fetches actual eBay sold listings or any live pricing source.

## Plan

### 1. Add web search for real market prices (eBay sold listings)

Before calling the AI for analysis, use Firecrawl (already available as a connector option) or the Lovable AI's built-in web search/grounding to fetch **actual recent eBay sold listings** for the card. This real data gets injected into the AI prompt so estimates are anchored to reality.

**Approach**: Use a two-step process in `analyze-card`:
- **Step 1**: Quick AI call to identify the card (name, set, year) — lightweight, no pricing
- **Step 2**: Search eBay sold listings using Firecrawl search (e.g., `"card name set year sold" site:ebay.com`)
- **Step 3**: Full AI analysis call with the real eBay data injected into the prompt context

For `quick-scan`, do the same two-step approach but lighter weight.

### 2. Update prompts with date awareness and pricing anchors

Both functions' system prompts will be updated to:
- Include today's date explicitly: `"Today's date is ${new Date().toISOString().split('T')[0]}"`
- Instruct the AI: "Base your value estimates ONLY on the provided market data. Do NOT guess prices from training data."
- Include the actual eBay sold data in the user message

### 3. Upgrade model for pricing accuracy

Switch from `google/gemini-2.5-flash` to `google/gemini-2.5-pro` for the full `analyze-card` function — the pro model is better at reasoning about pricing data. Keep flash for quick-scan step 1 (identification only).

### Technical Changes

**File: `supabase/functions/analyze-card/index.ts`**
- Add Step 1: lightweight identification call (card name + set + year only) using flash model
- Add Step 2: Firecrawl search for `"{card_name} {card_set} {card_year} sold" site:ebay.com` to get real sold prices
- Add Step 3: inject eBay results + today's date into the full analysis prompt
- Update system prompt to say: "You are provided with REAL recent eBay sold listing data below. Use these prices as your primary valuation anchor. Today's date is {date}."
- Switch model to `google/gemini-2.5-pro`

**File: `supabase/functions/quick-scan/index.ts`**
- Add today's date to system prompt
- Add instruction: "Provide conservative estimates. If unsure about current market value, indicate low confidence rather than guessing."
- Optionally add a quick Firecrawl search step (if latency is acceptable for quick scan)

**Connector**: Connect Firecrawl for eBay search capability (or fall back to AI-only with strong date grounding if Firecrawl isn't connected)

### Fallback Strategy

If Firecrawl isn't available or search fails:
- Still inject today's date
- Add explicit prompt: "Your training data may have outdated prices. Clearly state that values are estimates and may not reflect current market. Set confidence to 'low' for pricing."
- The AI disclaimer component already exists for the frontend

### Summary of Impact

- **analyze-card**: Real eBay data → accurate $125 range instead of $5-15 hallucination
- **quick-scan**: Date-aware + conservative prompting → less misleading estimates
- **Both**: Model knows today's date, anchors to real data when available

