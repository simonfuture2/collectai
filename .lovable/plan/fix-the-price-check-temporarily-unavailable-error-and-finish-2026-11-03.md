# Fix the Price Check "temporarily unavailable" error and finish real-photo testing

## What I found so far
- Price check is the only feature that limits the photo reader's answer to 400 tokens. Every other photo read sets no limit, and those reads work.
- The photo reader runs with "low" thinking on both routes. On Gemini 3.x the thinking tokens count against that limit, so a 400 limit can cut the answer off before the JSON finishes. That matches the 503 you're seeing.
- No price-check logs are kept from the failed runs (they've expired), so I can't confirm the cause from logs yet. Step 1 checks it with a fresh run.

## Steps
1. **Confirm the cause:** run one signed-in price check with a real photo before changing anything. Then read the price-check logs and report the direct-route status or timeout, the backup route's status, and whether the answer was empty or cut off. If something else is to blame (missing key plus a 402/429 on the backup, or the 6-second direct timeout), I fix that instead and explain.
2. **Better logging** in the shared photo reader:
   - Direct route: on every call, log `[gemini] route=direct finish=… thoughts=… out=… ms=…` from finishReason and usageMetadata, and warn on MAX_TOKENS.
   - Backup route: log finish_reason and usage the same way.
   - On a parse failure on either route, log the first 300 characters of the raw reply.
3. **Fix:** raise the price-check limit from 400 to 2048 and keep thinking at "low". The only other caller (sealed scans) passes no limit, so nothing else is under 2048. Redeploy.
4. **Real-photo run** with 7 photos: Pokémon English, Pokémon Japanese, One Piece Japanese, Magic, Yu-Gi-Oh!, a sports card, and a PSA slab. I'll use freely available real card images. For each one, signed in as the admin account:
   - run a price check
   - switch the match on the result page
   - tap "Add to collection" (free, price-only)
   - tap "Full analysis" (paid upgrade)

   I'll use the Price Check Lab for timing where it helps. Then I'll report a table with identify_ms, total ms, whether the top match was right, and pass or fail for each step. Test cards are deleted afterwards and any credits spent are refunded.
5. **Roadmap:** I mark the item done only if every step passes. Otherwise it stays open, with each failure and its cause named.

## Technical notes
- Files: `supabase/functions/_shared/gemini.ts` (logging), `supabase/functions/price-check/index.ts` (limit).
- The full analysis upgrade goes through `reanalyze-card`, which is tested with the existing priceOnlyUpgrade path.
- Sports cards aren't in the stored list, so that photo uses the live PriceCharting lookup.
