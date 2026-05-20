# Plan: Gemini-for-vision, Claude-for-pricing scan pipeline

All edits in `supabase/functions/enrich-card/index.ts`. No other files touched.

## Stage 1 — `identifyCardFromImages` (Gemini vision, expanded)

Rewrite to produce identification **and** condition assessment in a single Gemini call via the existing Lovable gateway (`callGeminiVision`).

- Model: `google/gemini-3.5-flash`, fallback `google/gemini-3-flash`. No Nano Banana.
- Send first 2 images (front + back) as `image_url` content parts (already how `callGeminiVision` works).
- `response_format: { type: "json_object" }`, `withTimeout(..., 25_000, "gemini-identify")`, `max_tokens` ~2048.
- Prompt asks Gemini to read all text on the card AND assess physical condition, returning the full JSON shape from the brief: identification fields + `category` + `preGradingAnalysis` (centering/corners/edges/surface/overallScore/predictedGrades/bgsSubgrades) + `defects[]` + `conditionGrade` + `conditionNotes` + `specialFeatures[]`.
- Defensive parse (strip ```json fences, locate first `{`…last `}`).
- Return `null` if no `card_name` so existing failure path triggers.

The function's return type widens to include `preGradingAnalysis`, `defects`, `conditionGrade`, `conditionNotes`, `specialFeatures`, `category`.

## Stage 2 — `runEnrichment` becomes text-only Claude pricing

Replace the current Gemini-based main analysis (lines ~376–500) with an Anthropic Claude call:

- Endpoint: `https://api.anthropic.com/v1/messages`, `model: "claude-sonnet-4-5"`, `max_tokens: 4096`.
- Messages: **text only**, no `type: "image"` blocks. Body contains:
  - Full Gemini identification JSON
  - Gemini condition summary (`overallScore`, `predictedGrades`, `conditionGrade`)
  - `marketData.summary` from Firecrawl
- Requested JSON schema is trimmed to pricing-only fields:
  `estimatedValueLow`, `estimatedValueHigh`, `valueCurrency`, `ebayRecentSales`, `tcgplayerPrice`, `psaPopulation`, `gradedValueEstimates` (PSA detailed + `otherGraders` collapsed to grade numbers), `priceFactors`, `valueTrend`, `trendReason`, `confidence`, `confidenceReason`, `investmentOutlook`, `additionalNotes`, `dataSource`.
- Do NOT ask Claude for cardName/set/year/condition/centering/corners/defects.
- Wrap in `withTimeout(..., 25_000, "claude-pricing")`.

## Stage 3 — Merge Gemini + Claude into final write

Build `analysis` by merging:
- Identification + condition from Gemini stage 1
- Pricing/market from Claude stage 2

DB `update` block:
- `card_name`, `card_set`, `card_year`, `rarity`, `condition_grade`, `special_features` ← Gemini
- value/market fields ← Claude
- `ai_analysis` ← merged object containing `preGradingAnalysis`, `defects`, `gradedValueEstimates`, all pricing fields, and `extractedMarketData` (so `CardDetail.tsx` keeps working unchanged).

## Stage 4 — Verification tweaks

Keep `verifyWithClaude` + `verifyWithGemini` for non-fast scans, with:
- Skip entirely when `analysis.estimatedValueHigh < 50`.
- Remove `thinking: { budget_tokens: 1024 }` from `verifyWithClaude`.
- Wrap each verify call in `withTimeout(..., 20_000, ...)`.

Fast Scan continues to skip broad/fallback search rounds AND verification (no change to that branch logic).

## Stage 5 — Status writes for timeline

Status sequence written at the start of each stage:
`identifying` → `pricing` → `analyzing` → `verifying` (skipped when value <$50 or fast scan) → `complete`.
The `identifying` write already exists at line 622; add `analyzing` write right before the Claude pricing call (replacing the current `analyzing` write at line 376 which currently wraps the Gemini analysis).

## Out of scope

- `identify-card/index.ts`, auth, credits, duplicate-check, DB schema.
- `analyze-card/index.ts`.
- Frontend (`CardDetail.tsx`, `ScanTimeline.tsx`) — shape of `ai_analysis` stays compatible.

## Verification after implementation

Test-scan `src/assets/scan-demo-charizard.jpeg` (non-Fast):
1. Card name/set/year populated.
2. Defect overlay + grading panel render (sourced from Gemini).
3. Value estimate renders (from Claude).
4. Wall-clock noticeably faster.
5. Network: identify hits `ai.gateway.lovable.dev`; pricing hits `api.anthropic.com` with **no** image payload.
