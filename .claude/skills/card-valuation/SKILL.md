---
name: card-valuation
description: Identify a trading card and estimate its market value (raw + graded) with a confidence score and pre-grade. Use when a user uploads a card image, asks what a specific card is worth, requests a "price," "comp," or "valuation," or mentions pre-grading — even if they don't say "value." This skill documents the PRODUCTION valuation pipeline so changes stay aligned with the live code. Do NOT use for non-card collectibles, general market-trend questions not tied to a specific card, or identification-only requests.
---

# Card Valuation

Identify a single trading card and produce a defensible market valuation. The
real valuation logic is the production TypeScript engine in this repo — this
skill points you at it so behavior stays in ONE place. **Do not reimplement
comp-gathering, blending, or confidence scoring; edit the shared modules.**

## Where the logic lives (single source of truth)

| Concern | File |
|---|---|
| Comp sourcing + blend + cross-reference | `supabase/functions/_shared/marketData.ts` (`getMarketData`) |
| PriceCharting lookup (catalog → live API → SportsCardsPro) | `supabase/functions/_shared/pricecharting.ts` |
| Daily PriceCharting catalog sync | `supabase/functions/pricecharting-sync/index.ts` |
| Confidence score (0–100 → High/Med/Low) | `supabase/functions/_shared/confidence.ts` (`computeMarketConfidence`) |
| Pre-grade rubric (lowest dimension caps) | `supabase/functions/_shared/grading.ts` (`groundedPreGrade`) |
| Full scan orchestration | `supabase/functions/_shared/analysisEngine.ts` |
| Standalone price endpoint | `supabase/functions/collectai-price/index.ts` |

## Workflow

### 1. Identify the card
Extract subject, set+year, card number (with prefix), and parallel/variant from
the image. An unsure parallel changes value by up to 10x — flag it, don't guess.

### 2. Source comps — via `getMarketData()`, never ad-hoc
`getMarketData(cardId, category)` is the ONLY comp path. Its tiered order is:
1. **PriceCharting** — local synced catalog first, then live API (SportsCardsPro for sports)
2. **eBay sold** via Firecrawl (fresh-first: last 7 days, falls back to 30)
3. **eBay active** + **TCGPlayer** via Firecrawl, kept as separate attributed sources
4. **Firecrawl broad/fallback search ONLY when PriceCharting misses AND eBay is sparse**

It returns attributed per-source data, a weighted `blended` value
(ebay_sold 0.4 · pricecharting 0.3 · tcgplayer 0.2 · ebay_active 0.1), and a
PriceCharting-vs-eBay `crossReference`. To change sourcing/weights, edit
`marketData.ts` — there is no config file to edit.

### 3. Raw + graded estimates
Use real graded sold comps / PriceCharting graded tiers per grade — never a
multiplier off the raw price. If there are no comps at a grade, report "no comps."
Map any visual pre-grade with `groundedPreGrade()` (see `references/grading-rubric.md`).

### 4. Confidence
`computeMarketConfidence()` derives the score from comp count, dispersion,
recency, and PriceCharting-vs-eBay agreement (see `references/confidence-scoring.md`).
Always surface the band and the single biggest limiting factor.

## Bundled references (the SPEC, implemented by the modules above)
- `references/grading-rubric.md` — the rubric implemented by `_shared/grading.ts`.
- `references/confidence-scoring.md` — the scoring implemented by `_shared/confidence.ts`.

These docs are the human-readable spec; the TypeScript modules are the
authoritative implementation. Keep them in sync when either changes.
