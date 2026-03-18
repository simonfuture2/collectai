

# Migrate collectai-identify & collectai-grade to Claude API

## What changes

Both edge functions currently call the Lovable AI Gateway with Gemini 2.5 Flash. We'll switch them to call the Anthropic Messages API directly using your existing `ANTHROPIC_API_KEY` secret.

## Key differences

- **Endpoint**: `https://ai.gateway.lovable.dev/v1/chat/completions` → `https://api.anthropic.com/v1/messages`
- **Auth header**: `Authorization: Bearer LOVABLE_API_KEY` → `x-api-key: ANTHROPIC_API_KEY`
- **Model**: `google/gemini-2.5-flash` → `claude-sonnet-4-20250514` (strong vision model for card analysis)
- **Request format**: OpenAI-compatible → Anthropic Messages API format (system prompt is a top-level field, image uses `source.type: "url"`)
- **Response parsing**: `data.choices[0].message.content` → `data.content[0].text`
- **Required headers**: Add `anthropic-version: 2023-06-01`

## Files to edit

1. **`supabase/functions/collectai-grade/index.ts`**
   - Remove `LOVABLE_API_KEY` check, add `ANTHROPIC_API_KEY` check
   - Rewrite fetch call to Anthropic Messages API
   - Update response parsing

2. **`supabase/functions/collectai-identify/index.ts`**
   - Same changes as above

## No other changes needed

- `ANTHROPIC_API_KEY` is already configured as a secret
- No database or frontend changes required
- The JSON response structure returned to callers stays identical

