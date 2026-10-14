# Centralize Claude model routing on the 5.5 generation

## 1. New shared module: `supabase/functions/_shared/claude.ts`
- `MODELS` map. Each entry has a model, an effort and max_tokens, and the model can be overridden by an env var:

| Task | Env override | Default model | Effort | max_tokens |
|---|---|---|---|---|
| PRICING_ANALYSIS | CLAUDE_MODEL_PRICING | claude-sonnet-5-5 | medium | 16000 |
| PRICE_VERIFY | CLAUDE_MODEL_VERIFY | claude-sonnet-5-5 | low | 4000 |
| PRE_GRADE | CLAUDE_MODEL_GRADE | claude-sonnet-5-5 | medium | 12000 |
| QUICK_SCAN | CLAUDE_MODEL_QUICK | claude-sonnet-5-5 | low | 4000 |
| DEMO_SCAN | CLAUDE_MODEL_QUICK | claude-sonnet-5-5 | low | 4000 |
| IDENTIFY_FALLBACK | CLAUDE_MODEL_IDENTIFY | claude-sonnet-5-5 | low | 6000 |

DEMO_SCAN reuses QUICK_SCAN's settings, including its env override.

- `callClaude({ task, system, messages, cacheSystem })`:
  - Sends the standard Anthropic headers, the model, max_tokens and `output_config: { effort }`. It never sends `thinking`.
  - When `cacheSystem` is true, the system prompt is sent as a cached text block.
  - It retries once after 1.5s on 429, 529 or 5xx.
  - On a 404, or a 400 whose error message mentions the model, it retries once with `CLAUDE_MODEL_FALLBACK ?? "claude-sonnet-4-6"` and logs a warning.
  - Text comes from the first block with `type === "text"`. It logs an error when stop_reason is max_tokens.
  - It logs one line per call: `[claude] task=… model=… in=… out=… cache_read=… ms=…`.
  - It returns `{ text, usage, model, stopReason }`. On a non-OK response it throws an error with the status and body, so each caller keeps its existing error handling.
- `parseJsonFromText(text)` strips ```json fences and parses the outermost `{…}` object.

## 2. Swap every direct Anthropic call to `callClaude`
- `_shared/analysisEngine.ts`: verifyWithClaude uses PRICE_VERIFY. Step 3 uses PRICING_ANALYSIS with `cacheSystem: true`.
- `quick-scan/index.ts` uses QUICK_SCAN. Its current retry wrapper is replaced by the one in callClaude.
- `collectai-grade/index.ts` uses PRE_GRADE.
- `demo-scan/index.ts` uses DEMO_SCAN. Today's refund-on-failure and market pricing stay as they are.
- `collectai-identify/index.ts` uses IDENTIFY_FALLBACK, moving from Opus 4.5 to Sonnet 5.5.
- In every function, the prompts, the image inputs (both URL and base64) and the JSON output shapes stay exactly the same. Only the transport, the model and the reply parsing change.
- Gemini calls are not touched: identifyWithGemini, verifyWithGemini, enrich-card, scan-slab and collectai-price.

## 3. Verify
- Deploy analyze-card, enrich-card, quick-scan, demo-scan, collectai-grade and collectai-identify.
- Re-run the demo-scan and quick-scan tests and check that the `[claude]` log lines appear.
- Search `supabase/functions` for `api.anthropic.com` and `claude-` and show you the results. The only matches should be inside `_shared/claude.ts`. Model IDs that appear in comments or strings elsewhere will be removed or reworded.

## Notes
- No code change is needed to try Opus for pricing: set the `CLAUDE_MODEL_PRICING=claude-opus-5-5` secret.
- Project memory still says AI runs on Gemini only. After this change, Claude is used for pricing, pre-grading, the public demos and the identify fallback. I'll update that memory line to match.
