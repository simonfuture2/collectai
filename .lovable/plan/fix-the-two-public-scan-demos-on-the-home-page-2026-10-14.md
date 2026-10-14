# Fix the two public scan demos on the home page

Both home-page demos call retired or soon-retired AI models. "Scan your card" fails for every visitor right now. This plan follows your brief in order.

## 1. demo-scan: new model
- Model `claude-sonnet-5-5`, `max_tokens: 4000`, `output_config: { effort: "low" }`. No `thinking` param.
- Read the reply from the first content block where `type === "text"`. Log `stop_reason === "max_tokens"` with console.error.
- System prompt, image input and response shape stay the same. Add `cardYear` and `variant` to the requested JSON fields so step 3 has them. These are extra fields only.

## 2. Refund failed scans
- Migration: `public.refund_demo_scan(_ip_hash text)`, SECURITY DEFINER with a fixed search_path. It takes 1 off today's `demo_scan_rate_limit` count for that IP and 1 off the `demo_scan` daily budget bucket, never going below 0. Execute is granted to service_role only, the same as the existing limit functions.
- demo-scan tracks a `consumed` flag and calls the refund before every 500 or 502 return that comes after the limits are used: AI error, parse failure, or unexpected catch. A `not_a_card` result still counts as a used scan.

## 3. Real market pricing in the demo
- After the AI reply comes back, call `getMarketData(ident, category, true)`. Map cardName, cardSet, cardYear, cardNumber and variant into `CardIdentification`.
- Wrap the lookup in a 6s `Promise.race` timeout.
- If `blended.median` exists: low = round(median × 0.85), high = round(median × 1.15), `pricedFrom: "market"`.
- Otherwise keep the AI's values with `pricedFrom: "estimate"`. Timeouts and errors also fall back to `"estimate"`.
- ScanDemo.tsx shows a small caption under the value: "Based on recent sold comps" or "AI estimate, sign up for live comps".

## 4. quick-scan: new model
- `claude-sonnet-5-5`, `max_tokens: 4000`, `output_config: { effort: "low" }`, and the reply text comes from the first text block. Prompt and response shape are unchanged.

## 5. Friendlier error message
- In ScanDemo.tsx, a 500 or 502 response shows: "Our scanner is busy. Try again in a moment. This didn't use one of your free scans." Rate-limit and not-a-card messages stay as they are.

## 6. Deploy and test
- Deploy demo-scan and quick-scan.
- Test each demo with a real card photo and a non-card photo, through the home page and direct function calls.
- Share the function logs from each test.

## Notes
- Project memory says to use Gemini for AI, not Anthropic. Your brief asks for Claude, so I'll follow the brief. Both functions already use Anthropic.
- If Anthropic rejects the `claude-sonnet-5-5` model ID during testing, I'll report the exact error and not swap in another model.
