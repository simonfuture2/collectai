# AI Scan Review & Upgrade

## Goal
Bring CollectAI's scanning pipeline to current state-of-the-art for accuracy: latest Claude models, extended thinking on the verification step, and fresher market comps.

## What changes

### 1. Model upgrade (the big lever)
Currently every Claude call uses `claude-sonnet-4-20250514` (May 2024 — outdated). Replace with the latest snapshots:

| Step | File | Old | New |
|---|---|---|---|
| Card identification (vision-heavy: read card #, set, variant) | `quick-scan/index.ts` Step 1 | `claude-sonnet-4-20250514` | `claude-opus-4-5` |
| Card identification | `analyze-card/index.ts` `identifyCard()` | `claude-sonnet-4-20250514` | `claude-opus-4-5` |
| Card identification | `collectai-identify/index.ts` | `claude-sonnet-4-20250514` | `claude-opus-4-5` |
| Full analysis + grading | `quick-scan/index.ts` Step 3 | `claude-sonnet-4-20250514` | `claude-sonnet-4-5` |
| Full analysis + grading | `analyze-card/index.ts` main call | `claude-sonnet-4-20250514` | `claude-sonnet-4-5` |
| Price verification | `analyze-card/index.ts` `verifyWithClaude()` | `claude-sonnet-4-20250514` | `claude-sonnet-4-5` |

Rationale: Opus 4.5 is the best vision model for reading tiny print (card numbers like `105/086`, set codes, variant labels) — that's the single biggest source of misidentification, which cascades into bad market searches and bad prices. Sonnet 4.5 is enough for the structured grading + pricing JSON output and is much cheaper/faster for the heavy 8K-token analysis call.

### 2. Extended thinking on price verification
The `verifyWithClaude()` step in `analyze-card` reconciles the AI estimate with real eBay/TCGPlayer data. This is where wrong answers do the most damage. Enable Anthropic's extended thinking on this single call:

```ts
body: JSON.stringify({
  model: "claude-sonnet-4-5",
  max_tokens: 2048,                    // raised from 512 to make room for thinking
  thinking: { type: "enabled", budget_tokens: 1024 },
  messages: [{ role: "user", content: prompt }],
})
```

Also update the JSON parsing to skip `thinking` content blocks and read the `text` block (Anthropic returns `content: [{type:"thinking",...},{type:"text",...}]` when thinking is on).

Not enabled on identification or full-analysis calls — those already perform well and the extra latency/cost isn't justified.

### 3. Fresher market comps
In both `quick-scan` and `analyze-card`, the Firecrawl search uses `tbs: "qdr:m"` (last 30 days) for all queries. Tighten the **sold listings** query to last 14 days (`qdr:w` × 2 isn't a thing, so use `qdr:w` for sold). Keep active listings and TCGPlayer at `qdr:m` since active listings turn over fast and TCGPlayer pricing pages aren't time-bound the same way.

```ts
// sold-listings searches:
body: JSON.stringify({ query, limit, tbs: "qdr:w" }),  // was qdr:m
// active + tcgplayer searches: keep qdr:m
```

If a sold-listings search returns <2 results, fall back to `qdr:m` automatically so we don't lose data on slow-moving cards.

### 4. Update memory note
Update the `technical/ai-provider` memory: Claude Opus 4.5 (identification) + Claude Sonnet 4.5 (analysis & verification), with extended thinking on verification.

## Files touched
- `supabase/functions/quick-scan/index.ts` — 2 model strings, market-freshness tweak
- `supabase/functions/analyze-card/index.ts` — 3 model strings, thinking on verifier, market-freshness tweak + fallback
- `supabase/functions/collectai-identify/index.ts` — 1 model string

## Out of scope
- No prompt rewrites (current prompts are well-tuned; changing them at the same time as the model would muddle attribution if accuracy regresses)
- No frontend changes
- No DB / RLS changes
- No provider switch — staying on direct Anthropic API since `ANTHROPIC_API_KEY` is already configured and billing is consolidated there per project memory

## Risk & rollback
Anthropic model IDs are the only behavioral change for steps 1–2; if Opus 4.5 ID causes latency complaints we can drop ID back to Sonnet 4.5 by changing one string per file. Extended thinking adds ~1–3s to the verification step but only fires when real market data exists.