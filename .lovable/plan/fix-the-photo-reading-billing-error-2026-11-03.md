# Fix the photo-reading billing error

## What's wrong
The photo reader calls Google directly with your own Google key, and that Google account is returning a billing error. Price checks, full scans, sealed scans and the homepage quick scan all use it, so they all fail at the first step.

## Fix
Send photo reading through the AI service that's already built into the app. The second price check in full scans already uses it. It uses the same Gemini model, and usage comes out of your workspace credits, so there's no separate Google account or card to keep paid up. Nothing changes on screen.

## Steps
1. Switch the two photo-reading helpers from Google's own service to the built-in AI service, keeping the same model, instructions and fast response settings.
2. Show a clear "AI busy, try again" message when usage is rate-limited, and "AI credits used up" when workspace credits run out, so these aren't reported as a general failure.
3. Redeploy price check, quick scan, sealed scans and full scans (identify, enrich, reanalyze).
4. Check it with a real card photo through price check and a full scan, and confirm it answers in under 4 s.

## Technical details
- `supabase/functions/_shared/gemini.ts`: `identifyWithGemini` and `geminiVisionJson` move to `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`. The image goes in as an `image_url` data URL, the model is `google/gemini-3.5-flash`, the response is requested as JSON, and the token limit and low reasoning settings are kept. Callers' signatures stay the same, and bare model names get a `google/` prefix added.
- The `GEMINI_API_KEY` secret stays stored but is no longer used, and can be removed later.
- 429/402 responses are logged with their own reason, and price-check maps them to clear user messages.
