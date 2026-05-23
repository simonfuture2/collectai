Plan to fix the edge-function errors:

1. Harden `enrich-card` JSON handling
- The latest logs show `enrich-card` failing while parsing Gemini vision output because the JSON is being truncated mid-response.
- I’ll update the Gemini vision call to request JSON mode, raise/adjust output limits, and use one shared resilient JSON extractor for identify, pricing, and verification responses.
- If parsing still fails, the function will save a clearer `analysis_error` instead of leaving the user with a generic edge-function failure.

2. Make identification less fragile
- The current prompt asks Gemini to return a very large identification + grading object in one response, which increases truncation risk.
- I’ll keep the same output fields but tighten the prompt so notes are concise and the returned JSON is smaller and valid.

3. Fix `collectai-price` fallback inputs
- The previous 400 error means `collectai-price` can still receive neither `cardName` nor usable `imageUrl` in some paths.
- I’ll pass `cardId` from the card detail page and update the function to load card name/set/year and image path from the database when request fields are missing.
- This makes price rescans work even when the card row only has stored analysis or a private image path.

4. Remove the lingering Claude call from `collectai-price`
- `collectai-price` still contains Anthropic/Claude verification even though the scanner was moved to Gemini-only.
- I’ll replace that verification with the same lightweight Gemini sanity-check pattern used in `enrich-card`, reducing timeout risk and keeping the AI stack consistent.

5. Deploy and validate
- Deploy the updated edge functions.
- Test `collectai-price` with a minimal `cardId` request and check recent `enrich-card` / `collectai-price` logs for the specific failures.
- Confirm the card scan flow no longer returns the 400 input error or JSON parse failure.