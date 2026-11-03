# Built-in AI as a backup for photo reading

## What's wrong
The photo reader calls Google directly with your own Google key, and that Google account is returning a billing error. Price checks, full scans, sealed scans and the homepage quick scan all use it, so they all fail at the first step.

## Fix
Your Google key stays the first choice. If Google fails for any reason (a billing error, a rate limit, an outage, a timeout, a missing key or an unreadable answer), the same photo goes straight to the AI service built into the app. That service runs the same Gemini model, and its usage comes out of your workspace credits. Users won't see anything different, apart from a short extra wait on that first failed try.

## Steps
1. Keep the two photo-reading helpers calling Google first. On any failure, retry once through the built-in AI service with the same model, instructions and fast settings.
2. Don't make users wait long on a slow Google reply: give it about 6 seconds before switching to the backup.
3. Log which route answered each time, so you can see how often the backup is used.
4. If the backup also fails, show "AI busy, try again" when it's rate-limited and "AI credits used up" when workspace credits run out. Anything else gets the usual error.
5. Redeploy price check, quick scan, sealed scans and full scans (identify, enrich, reanalyze).
6. Check it with a real card photo through price check and a full scan. With the current Google billing error, this should succeed through the backup.

## Technical details
- `supabase/functions/_shared/gemini.ts`:
  - Split each helper into `callGoogleDirect` and `callGateway`, then try them in that order.
  - The backup calls `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`. The image goes in as an `image_url` data URL, the model is `google/<model>` (prefix added to bare model names), JSON output is requested, and the existing token limit and low reasoning settings are kept.
  - The direct call gets an `AbortController` timeout (about 6 s). Missing `GEMINI_API_KEY` skips straight to the backup.
  - Callers' signatures stay the same. Logs read `[gemini] route=direct|gateway`, plus the failure reason.
- The image is converted to base64 once and reused by both routes.
- 429/402 from the backup are logged with their own reason, and price-check maps them to clear user messages.
