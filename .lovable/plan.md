# Fix "Could not identify the card" on clear photos

## What's wrong
The scan logs show the photos are fine. The step that identifies the card uses your own Google Gemini account, and Google is rejecting every request with "Your prepayment credits are depleted" (HTTP 402). The step gets no answer back, so the scan fails and shows the "clearer image" message, which is misleading.

## Fix
1. Send card identification through the built-in Lovable AI service first. It runs the same Gemini model and needs no Google billing. Your own Gemini key becomes the backup.
2. If identification still fails, try Claude next. It is already set up as the identify fallback.
3. Show an honest message when the AI service is out of credits or rate-limited: "Scanning is temporarily unavailable, please try again shortly". Save "try a clearer image" for photos the AI really couldn't read.
4. Refund the scan credit when the failure is on our side and not caused by the photo.
5. Redeploy, run a real scan and check the logs.

## Your option
You can also top up prepayment credits in Google AI Studio to make your own Gemini key work again. The fix above stops scanning from depending on it.

## Technical details
- `supabase/functions/_shared/gemini.ts`: when the call to `generativelanguage.googleapis.com` fails, retry through `ai.gateway.lovable.dev` with `LOVABLE_API_KEY` and model `google/gemini-3.5-flash`. Also return a typed error (`billing` / `rate_limit` / `unreadable`) instead of a bare null.
- `enrich-card/index.ts` (around line 160): when Gemini returns null, use the Claude identify fallback from `_shared/claude.ts`. Map the error type to the message shown to the user and refund the credit.
- Apply the same handling to the other places that call `_shared/gemini.ts` (identify, reanalyze and sealed paths).
