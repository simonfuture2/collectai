# Gemini Direct-API Client

Adds a shared edge-function helper that calls Google's Generative Language API directly (no Lovable AI Gateway, no Anthropic) and returns the existing `CardIdentification` shape used elsewhere in the project.

## 1. Secret

Request `GEMINI_API_KEY` via `add_secret`. You'll paste the value from Google AI Studio. No other secrets touched.

## 2. New file: `supabase/functions/_shared/gemini.ts`

First file in a new `_shared/` directory (Deno edge functions can import sibling paths with `../_shared/gemini.ts`).

Exports:

```ts
export type CardIdentification = {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
};

export async function identifyWithGemini(
  imageInput: string,                  // signed https URL OR base64 data string (with or without data: prefix)
  model: string = "gemini-3.5-flash",
): Promise<CardIdentification | null>
```

### Behavior

- Reads `GEMINI_API_KEY` from `Deno.env`. If missing → log + return `null`.
- Normalizes `imageInput`:
  - If it starts with `http(s)://` → `fetch` the URL, read bytes, base64-encode, infer mime from `Content-Type` (fallback `image/jpeg`).
  - If it starts with `data:<mime>;base64,<…>` → strip prefix, capture mime.
  - Otherwise treat as raw base64, mime defaults to `image/jpeg`.
- Calls:
  ```
  POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}
  ```
  Body:
  ```json
  {
    "system_instruction": { "parts": [{ "text": IDENTIFY_SYSTEM_PROMPT }] },
    "contents": [{
      "role": "user",
      "parts": [
        { "inline_data": { "mime_type": "<mime>", "data": "<base64>" } },
        { "text": "Identify this trading card with maximum specificity. Read the card number, variant type, and all visible text." }
      ]
    }],
    "generationConfig": {
      "responseMimeType": "application/json",
      "thinkingConfig": { "thinkingLevel": "low" }
    }
  }
  ```
- `IDENTIFY_SYSTEM_PROMPT` is the verbatim identification prompt already used in `analyze-card` and `id-bakeoff` (asks for `card_name`, `card_number`, `card_set`, `card_year`, `variant`, `rarity` as JSON).
- Parses `candidates[0].content.parts[].text` (concatenated), then `JSON.parse`. Uses a loose-JSON fallback (extract first `{…}` block) for resilience.
- Normalizes the parsed object to `CardIdentification` (every field coerced to string, missing fields → `""`).
- Full try/catch around fetch + parse; on any error or non-2xx response, `console.error("[gemini] …", details)` and return `null`. Never throws.

### Out of scope (this prompt)

- Wiring this helper into `id-bakeoff`, `analyze-card`, or any other function (separate follow-up).
- Latency measurement (caller's responsibility).
- Pricing / grading endpoints.

## Files

**New**
- `supabase/functions/_shared/gemini.ts`

**Touched**
- Secrets: `GEMINI_API_KEY` added via secret tool.

No DB changes, no frontend changes, no config.toml changes.

## Confirm before I build

- Model default `gemini-3.5-flash` matches your prompt — Google's current GA flash model id is `gemini-2.5-flash`. I'll use `gemini-3.5-flash` exactly as you wrote it; if the API rejects it the helper will log and return `null`. Say the word if you'd rather default to `gemini-2.5-flash`.
