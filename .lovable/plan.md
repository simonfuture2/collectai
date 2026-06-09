# Unify the scan pipeline behind one shared engine

Three sequential steps. Each is its own commit-sized change, finished and verified before the next begins. No behavior changes in steps 1–2 beyond what's stated; step 3 is the only intentional UX change.

---

## Step 1 — Extract `_shared/analysisEngine.ts`

Today, `supabase/functions/analyze-card/index.ts` (1,347 lines) is the canonical pipeline. Lines ~605–1173 contain the actual analysis logic, mixed in with HTTP handling, auth, credit deduction, and DB writes.

Create **`supabase/functions/_shared/analysisEngine.ts`** exporting:

```ts
export interface RunAnalysisInput {
  images: { label: string; url: string }[];
  category?: string;
  fastScan?: boolean;
}

export interface RunAnalysisResult {
  analysis: any;                      // the merged analysis object
  identification: CardIdentification; // from Gemini Step 1
  marketData: AggregatedMarketData;   // from getMarketData
  hasBackImage: boolean;
}

export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult>;
```

Move these blocks from `analyze-card/index.ts` into the engine, unchanged:

- Helpers: `extractPrices`, `filterOutliers`, `median`, `safeFixed`, `buildSearchTerms`, `verifyWithClaude`, `verifyWithGemini`, the local `searchMarketPrices` Firecrawl helper (only the parts the engine still needs — most market work goes through `getMarketData`).
- **Step 1**: identify via `identifyWithGemini(images[0].url, IDENTIFY_MODEL)`.
- **Step 2**: `getMarketData(cardId, category, fastScan)` aggregation.
- **ID ↔ comp cross-check**: `crossCheckIdentification` + `variant_confidence`.
- **Step 3**: Claude system prompt + `fetch` to `api.anthropic.com`, JSON parsing, fallback object.
- **No-market-data guardrails** (capping, widening, warnings).
- **Step 4**: dual Claude + Gemini verification, blend, dataSource label.
- **Step 4.5**: identification-uncertainty widening.
- **Step 4.6**: grading-arbitrage EV headline (`gradingEdge`).
- **Step 4.7**: 0–100 confidence score + band.
- Set `analysis.hasBackImage`.

Keep external behavior: same field names, same logging prefixes, same model constants. `IDENTIFY_MODEL` moves into the engine.

What stays in `analyze-card/index.ts`:

- CORS, auth, signed-URL validation, rate limit (10/hr), credit check.
- After `const { analysis, marketData, identification, hasBackImage } = await runAnalysis({ images, category: body.category, fastScan: body.fastScan === true });`:
  - Duplicate check on `image_url`.
  - Insert `cards` row.
  - Insert `price_history` rows (use a small helper or reuse `buildPriceHistoryRows` from `marketData.ts`).
  - `computePriceTrend` → `analysis.priceTrend`.
  - `buildRecommendation` → `analysis.recommendation`.
  - Persist updated `ai_analysis`.
  - Deduct credit + insert `credit_transactions` row.
  - Return response.

**Verification**:
- `deno check` both files.
- Compare a sample scan request/response on the preview to a pre-change baseline — same keys, same shape, same `confidenceScore` math.

---

## Step 2 — Put `enrich-card` on the shared engine

Replace the internals of `supabase/functions/enrich-card/index.ts` so the background path uses the same engine.

Remove from `enrich-card/index.ts`:

- The local `searchMarketPrices(...)` (Firecrawl-only, lines ~370–650).
- `analyzePricingWithGemini(...)` (lines ~189–360).
- The pricing-stage Gemini call site (lines ~728–741).
- All the post-pricing guardrails that are now inside the engine: no-market-data widening, per-tier grounding gate, raw-anchor warning, raw-vs-graded reconciliation, dataSource relabel.

Keep in `enrich-card/index.ts`:

- Service-role auth gate on `Authorization` header.
- Stage-1 identify-from-images path (`identifyCardFromImages`) — but only as a fallback for callers that don't pre-identify. When it runs, persist the early `card_name/card_set/...` update as today, then call the engine with `images` (engine will re-identify; that's acceptable for now since both go through Gemini 3.5 Flash via different code paths — we accept one extra identify call to keep the engine signature clean).
- `analysis_status` transitions: `identifying` → `pricing` → `analyzing` → `complete` / `failed`. Drive them around the `runAnalysis` call. Set `pricing` before the call, `analyzing` is no longer a distinct stage (engine does both); collapse to `pricing` → `complete`. Status enum values stay the same.
- The `cards` row update at the end (write `ai_analysis`, `estimated_value_*`, `ebay_recent_sales`, `tcgplayer_price`, `psa_population_data`, `analysis_status='complete'`, `analysis_completed_at`).
- `price_history` insert.
- `EdgeRuntime.waitUntil` background pattern + `failed` status on throw.

New call site (roughly):

```ts
const { analysis, marketData } = await runAnalysis({
  images,
  category: resolvedCategory,
  fastScan: fastScan === true,
});
// then write cards row + price_history exactly as today
```

After this step, **Scan → identify-card → enrich-card** runs the same engine as **analyze-card**. Delete the now-unused helpers (`searchMarketPrices`, `analyzePricingWithGemini`, `extractPrices`, `filterOutliers`, `median` if unused) from `enrich-card/index.ts` so the file drops ~700 lines.

**Verification**:
- Run a fresh scan from the Scan page (which routes through `identify-card` → `enrich-card`) and a "Re-analyze" from CardDetail; confirm the resulting card row has the same fields populated as a current `analyze-card` row (including `confidenceScore`, `confidenceBand`, `gradingEdge`, `priceTrend` if you also wire the post-engine trend/recommendation calls into the enrich path — yes, do this; copy the same `computePriceTrend` + `buildRecommendation` + persist block from `analyze-card`).
- Check `analysis_status` reaches `complete`.

---

## Step 3 — Never hard-fail a scan

Edit `_shared/analysisEngine.ts`:

1. Remove the `throw new Error("Pricing analysis failed")` path (currently in `enrich-card`; after step 2 it lives only in the engine if it survived the move — it should be deleted, not moved).
2. When market data is empty **and** the Claude call returns no usable analysis, synthesize the existing low-confidence fallback object (the one already used in `analyze-card`'s `catch (parseError)` block) and continue through Steps 4.5 / 4.6 / 4.7 with `confidence='low'`, `noMarketData=true`, `confidenceReason` explaining the situation, and a wide value range.
3. Add a top-level `analysis.softWarning: string` whenever the engine had to use the fallback or when `marketData.hasData === false`. Example: `"Limited data — this is a best-effort estimate. Re-scan with a clearer photo of the front and back for a tighter range."`
4. The engine always resolves with a `RunAnalysisResult`; it should only throw on infrastructure errors (missing API key, network exception bubbling past internal try/catch).

Edit `enrich-card/index.ts`:

- On engine success, write `analysis_status='complete'` even when `confidence='low'`. Never write `analysis_status='failed'` for a low-confidence result. Only write `failed` if the engine throws (infra error) or identification returns no `card_name`.

Edit `analyze-card/index.ts`:

- Already returns the analysis object on parseError today. Keep that, but now the engine handles the fallback uniformly, so the outer function only needs to surface the engine's result.

Edit the UI in `src/pages/CardDetail.tsx`:

- When `analysis.softWarning` is present (or `confidenceBand === 'low'` with `noMarketData`), render a non-destructive amber notice (`<Alert variant="default">` or similar — reuse the existing `AIDisclaimer` styling pattern) above the value range instead of any red failure card.
- Keep the existing "Retry analysis" CTA available.

**Verification**:
- Force a no-market-data path locally by scanning an obscure card or temporarily blocking `FIRECRAWL_API_KEY` in the engine; confirm the card row reaches `analysis_status='complete'`, has a wide low-confidence range, has `softWarning` set, and CardDetail shows an amber notice (not red).
- Confirm normal cards are unaffected (no `softWarning`, `confidence` driven by Step 4.7 score as before).

---

## Technical notes

- `_shared/analysisEngine.ts` will import: `identifyWithGemini` from `../_shared/gemini.ts`, `getMarketData` / `crossCheckIdentification` / types from `../_shared/marketData.ts`. It does **not** import Supabase client — pure analysis, no DB writes.
- Anthropic + Lovable API keys are read inside the engine via `Deno.env.get`; if `ANTHROPIC_API_KEY` is missing the engine throws (infra error) — that path is unchanged.
- Steps are independent commits: do not start Step 2 until Step 1 passes verification. Do not start Step 3 until Step 2 passes verification.
- No migrations. No new tables. No new secrets. No client API changes other than the CardDetail soft-warning rendering in Step 3.
