## Goal

Make eBay sold-comp searches reach back ~3 years (so historical sales for niche/vintage cards like the '97-'98 Metal Universe Jordan #23 actually surface), and make per-grader pricing category-aware (sports → PSA + BGS + SGC; TCG/non-sports → PSA + CGC + BGS + TAG; never invent missing tiers).

All changes are in `supabase/functions/enrich-card/index.ts`. No DB/UI changes needed.

## Changes

### 1. Extend eBay sold search to ~3 years with tiered fallback

Today every eBay search uses `qdr:w` then `qdr:m` (week → month). For vintage / low-volume cards this returns 0 comps and the engine then either invents a value or shows "no data."

Replace the single-step fallback with an **escalating recency ladder** that stops as soon as we have enough comps:

```text
qdr:w  (last 7 days)   → need ≥ 3 results
qdr:m  (last 30 days)  → need ≥ 3 results
qdr:y  (last 12 months)→ need ≥ 2 results
qdr:y3 (last 3 years)  → accept whatever exists
```

Apply this ladder to:
- `searchSold(...)` used for raw eBay sold comps
- The per-grade `gradedComps` Firecrawl calls in the `tiers` loop (currently hardcoded to `qdr:m`)

In the persisted `extractedMarketData`, tag each comp set with the recency window that produced it (`recencyWindow: "7d" | "30d" | "12m" | "36m"`) so the UI can later display "Sold in last 3 years" instead of falsely implying 30‑day freshness.

### 2. Category-aware grader coverage

`searchMarketPrices` already computes `isSportsCard`. Currently the `tiers` array always searches PSA + BGS + CGC for every category (SGC and TAG are skipped entirely). Make the tier list depend on category:

```text
Sports     → PSA (10/9/8), BGS (10/9.5/9), SGC (10/9.5/9)
TCG        → PSA (10/9/8), CGC (10/9.5/9), BGS (10/9.5/9), TAG (10/9)
Coin/Other → PSA (10/9/8), CGC (10/9.5/9), BGS (10/9.5/9)
```

Skipped graders are stored as `null` in `gradedComps` (already the convention) so the UI honestly shows "not tracked for this category" instead of an invented number.

### 3. Category-aware raw price sources

In the same function:
- Sports cards: skip TCGPlayer entirely (already partially done) and weight blended price = eBay sold 70% + eBay active 30%.
- TCG: keep current eBay sold 50% + TCGPlayer 30% + eBay active 20%.
- Coin / Comic / Other: eBay sold 70% + eBay active 30% (no TCGPlayer).

### 4. Pass `recencyWindow` to the AI pricing prompt

In the Gemini pricing prompt, include which recency window produced the comps and instruct the model that older comps (12m / 36m) should be treated as lower-confidence anchors and the confidence badge must drop to "Limited market data" when only `qdr:y` / `qdr:y3` returned results. This keeps the "High Confidence" badge honest.

### 5. Sanity-check still applies

The existing raw-vs-graded reconciliation and the `psaAtGrade < rawHigh` warning stay as-is — they now operate on better-grounded comps because the 3-year window provides real anchors for vintage cards.

## Files touched

- `supabase/functions/enrich-card/index.ts` — `searchSold`, the `tiers` array construction inside `searchMarketPrices`, blended-weight logic, and the pricing prompt assembly.

## How we'll know it worked

Re-scan the '97-'98 Metal Universe Jordan #23. The card should now show real PSA 9 and PSA 10 sold comps pulled from eBay's last 3 years (matching the ~$151 PSA 9 / higher PSA 10 ballpark from Card Ladder), SGC tiers populated (sports), no TCGPlayer row, and a confidence badge that reflects how recent the comps actually are.
