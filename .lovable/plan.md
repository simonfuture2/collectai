

# Fix: quick-scan edge function — migrate Step 1 to Claude + add retry logic

## Problem
The `quick-scan` function is failing with Claude API **529 "Overloaded"** errors and has no retry logic. Additionally, Step 1 (card identification) still uses the Lovable AI Gateway with Gemini Pro, which will stop working when Lovable credits run out.

## Changes

### File: `supabase/functions/quick-scan/index.ts`

**1. Add a retry helper with exponential backoff**
- Create a `fetchWithRetry` function that retries on 429 and 529 status codes (up to 3 attempts with 2s/4s delays)
- Use it for all Claude API calls

**2. Migrate Step 1 (identification) from Lovable Gateway to Claude API**
- Replace the `LOVABLE_API_KEY` / Gemini Pro call (lines 243-316) with an Anthropic Messages API call using `ANTHROPIC_API_KEY`
- Convert the OpenAI tool_choice format to a Claude JSON-output prompt (ask Claude to return JSON directly)
- Remove `LOVABLE_API_KEY` dependency entirely

**3. Wrap Step 3 (analysis) with the retry helper**
- Replace the direct `fetch` on line 355 with the `fetchWithRetry` wrapper

## No other changes needed
- `ANTHROPIC_API_KEY` is already configured
- No frontend or database changes required
- Response format to the client stays identical

