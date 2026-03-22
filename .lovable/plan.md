

# Fix: Auto-save scan results + Migrate analyze-card to Claude + Speed improvements

## Problem Summary
1. Credit deducted but card not in collection — user must manually click "Add to Collection" which is easy to miss
2. Scan takes ~60s due to 4+ sequential AI calls
3. `analyze-card` still uses Lovable AI Gateway (will break when credits deplete)

## Changes

### 1. Auto-save card after successful scan
**File: `src/pages/Scan.tsx`**
- After `analyze-card` returns successfully (line 150), automatically call the same save logic currently in `saveToCollection`
- Insert the card into the `cards` table and price history immediately
- Navigate to the card detail page (`/card/:id`) instead of showing an intermediate "Add to Collection" screen
- Remove the manual "Add to Collection" button; replace with "View Card" if needed
- This ensures credits are never wasted on unsaved results

### 2. Migrate analyze-card to Claude API
**File: `supabase/functions/analyze-card/index.ts`**
- **Step 1 (identifyCard function, line 373)**: Replace Lovable AI Gateway call with Anthropic Claude API (`claude-sonnet-4-20250514`). Convert from OpenAI-compatible format to Anthropic Messages format. Use structured JSON response instead of tool_choice (Claude handles JSON output well).
- **Step 3 (full analysis, line 675)**: Same migration — replace gateway call with Claude API. Move system prompt to top-level `system` field, convert image_url blocks to Anthropic image blocks.
- **Remove Gemini fallback verifier** (lines 296-370): No longer needed since Claude is primary for everything.
- **Remove `LOVABLE_API_KEY` dependency**: Function will only need `ANTHROPIC_API_KEY`.

### 3. Minor speed optimization
- In Step 1 (identification), use `claude-sonnet-4-20250514` instead of the slower Pro model — Sonnet is fast and excellent at vision tasks
- In Step 3 (full analysis), also use Sonnet — the detailed prompt guides output quality more than model tier
- This should reduce total time from ~60s to ~30-40s

## Files to edit
1. `src/pages/Scan.tsx` — auto-save after scan
2. `supabase/functions/analyze-card/index.ts` — migrate to Claude API

## No other changes needed
- `ANTHROPIC_API_KEY` is already configured
- Database schema unchanged
- Card detail page already handles viewing saved cards

