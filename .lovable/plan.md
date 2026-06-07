# Fix: Graded ladder hallucination + raw-vs-graded incoherence

## What's actually wrong (verified in code)

`supabase/functions/collectai-price/index.ts` only fetches **raw** market data:
```
"${specific}" sold site:ebay.com
"${specific}" site:ebay.com
"${specific}" price site:tcgplayer.com
```
There is **no per-grade search**. No `PSA 9`, no `PSA 10`, no `BGS 9.5` — nothing.

`supabase/functions/enrich-card/index.ts` then feeds this raw-only summary to Gemini and asks it to fill the entire graded ladder, with this instruction (line 244):

> *"If you lack precise per-grader sales, estimate based on the PSA anchor and typical inter-grader premiums (BGS ~PSA, CGC ~0.85x PSA for sports / ~0.9x for TCG, SGC ~0.9x PSA for sports, TAG ~0.8x PSA for TCG)."*

That is the exact "raw-to-graded multiplier" pattern Anthropic flagged. It produces $2,200 PSA 9s and $7,500 PSA 10s with a "High Confidence / Real eBay data" badge while no graded comps were ever pulled. And there is no reconciliation step preventing `valueAtGrade < rawValue` from being saved (the Jordan card shows raw $2,486 / graded $1,850 / −28% ROI).

## Fix — four layers

### 1. `collectai-price` — fetch per-grade graded comps

Add a second retrieval pass that runs *per grader/grade tier* relevant to the card category, in parallel with the existing raw search:

```text
"${specific}" PSA 10 sold site:ebay.com
"${specific}" PSA 9  sold site:ebay.com
"${specific}" PSA 8  sold site:ebay.com
"${specific}" BGS 9.5 sold site:ebay.com
"${specific}" BGS 9   sold site:ebay.com
"${specific}" CGC 10  sold site:ebay.com
"${specific}" CGC 9.5 sold site:ebay.com
"${specific}" SGC 10  sold site:ebay.com   # sports only
"${specific}" TAG 10  sold site:ebay.com   # TCG only
```

Filter, dedupe, outlier-strip exactly the way raw prices are handled today. Return a new `gradedComps` block alongside `extractedMarketData`:

```ts
gradedComps: {
  psa:  { "10": { median, low, high, count, prices } | null, "9": ..., "8": ... },
  bgs:  { "10": ..., "9.5": ..., "9": ... },
  cgc:  { ... },
  sgc:  { ... },
  tag:  { ... },
}
```

A tier with `count === 0` stays `null`. **Never** fill it with a multiplier guess at this layer.

Add a `gradedSummary` markdown block to the prompt context so the LLM sees the comps verbatim and can quote them.

### 2. `enrich-card` — ground each tier, or refuse

Rewrite the graded-ladder portion of the system prompt around three rules:

- **Per-tier grounding:** For each grader/grade tier, the AI MUST use the median from `gradedComps[grader][tier]` when `count >= 2`. Quote the comps used in `notableSales` for that tier.
- **No comps → null, not a multiplier.** When `count < 2` for a tier, set `valueAtGrade` to `null`, lower `confidence` to `"low"`, and write a `confidenceReason` like *"No PSA 9 sold comps found in last 30 days."* Remove the entire "estimate based on the PSA anchor and typical inter-grader premiums" instruction.
- **Raw–graded reconciliation gate (deterministic, in code, not prompt):** After parsing the AI response, run:
  ```ts
  if (psa.valueAtGrade && rawHigh && psa.valueAtGrade < rawHigh && !knownDowngrade) {
     // either bump valueAtGrade up to rawHigh, OR mark whole ladder as low-confidence
     // with reason: "Raw comps exceed graded estimate — likely raw anchor inflated by anomalous listing"
  }
  ```
  Also flag inflated raw anchors: if the raw median is built on **fewer than 3 comps** OR **any single comp > 2× the next-highest comp**, mark `rawConfidence = "low"` and surface that in the UI rather than presenting it as a confident dollar figure.

### 3. Front-end honesty (`src/pages/CardDetail.tsx`)

Tiny presentational changes to match the new server contract:

- When `valueAtGrade === null` for a grader, render *"Insufficient sold comps — no estimate"* instead of `$0` or a fabricated number, and hide the ROI calculator for that tier.
- When `confidence === "low"` for either raw or graded, show the badge as **"Low Confidence — limited comps"** (not green), and never show the green "Real eBay + TCGPlayer data" badge unless ≥3 comps were retrieved for that tier.
- Hide the negative-ROI ribbon when `rawConfidence === "low"` and a reconciliation gate fired — instead show *"Raw value uncertain — re-scan recommended."*

### 4. Demo guardrails (out of code, into product hygiene)

- Add a small `demoEligible` boolean to a card: `true` only when raw `confidence === "high"`, at least one grader tier has `confidence === "high"`, AND graded ROI is positive. Surface this as a "Hero card ✓" tag for internal/demo use only.
- Pin two known-liquid hero cards (e.g. a modern PSA 10 Pokémon, a liquid sports rookie) into the demo collection so screenshots/videos always lead with them.
- Branding consolidation: pick **CollectAI** + `mycollectai.com` as canonical; sweep `support@collectai.app` and stray `MyCollectAi.com` strings. (Single grep/replace pass — listed here for completeness, not a code-architecture change.)

## What this does NOT change
- The raw valuation engine (eBay sold + TCGPlayer blend) — Anthropic said it's fine.
- The vision / condition / grading pipeline.
- The grader-coverage UI (PSA/BGS/CGC/SGC/TAG cards still render; they just go null when honest).

## Files touched
- `supabase/functions/collectai-price/index.ts` — add per-grade retrieval, return `gradedComps`.
- `supabase/functions/enrich-card/index.ts` — new prompt rules, post-parse reconciliation gate, raw-anchor sanity check.
- `supabase/functions/analyze-card/index.ts` — mirror the same prompt+gate (it shares the schema).
- `src/pages/CardDetail.tsx` — null-aware grader tiles, honest confidence badge, suppressed ROI on low-confidence raw.
- Branding sweep (string replace) — separate small pass.

## How we'll know it worked
Re-scan the 1997-98 Metal Universe Jordan #23. Expected:
- PSA 9 lands near real eBay sold comps (~$150) OR shows *"Insufficient sold comps"* with low confidence — never $2,200 with a green badge.
- Raw vs graded ladder is internally coherent (graded ≥ raw at predicted grade, or a visible "raw anchor uncertain" warning).
- Confidence badge accurately reflects whether real per-tier comps backed each number.
