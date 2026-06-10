# Confidence Scoring

Turns the raw comps into a single High / Medium / Low label, backed by a 0–100
score. This is the human-readable spec; the implementation is
`supabase/functions/_shared/confidence.ts` (`computeMarketConfidence`). Keep
them in sync.

The point of the score is to keep the estimate honest. A $500 number from one
stale sale and a $500 number from twelve recent tightly-clustered sales that
PriceCharting also agrees with are not the same claim.

## The four weighted factors (0–100)

### 1. Data sufficiency (30 pts)
Number of eBay sold comps:
- **≥ 6** → 30 pts
- **3–5** → 18 pts ("limited")
- **1–2** → 8 pts
- **0** → 0 pts ("no eBay sold comps")

### 2. Price dispersion (25 pts)
Coefficient of variation (std dev ÷ mean) of the sold comps (needs ≥ 2):
- **CV ≤ 0.10** → 25 pts (tight)
- **CV ≤ 0.20** → 18 pts (moderate)
- **CV ≤ 0.35** → 10 pts (wide)
- **CV > 0.35** → 3 pts (very wide)

### 3. Recency (20 pts)
Freshness of the sold comps (eBay search is fresh-first: 7d → 30d):
- **≤ 14 days** → 20 pts
- **≤ 30 days** → 14 pts
- **≤ 60 days** → 7 pts
- **older** → 2 pts

### 4. Cross-source agreement (25 pts)
PriceCharting vs eBay-sold median:
- **Agree (within ~15%)** → 25 pts
- **Diverge** → 4 pts
- **Only one independent source present** → 10 pts

## Adjustments and banding

- Verifier models disagree > 40% → subtract 15.
- No sold comps and no PriceCharting value → cap score at 35.
- Identification uncertain vs comps → cap score at 74.

Band from the total: **High ≥ 75 · Medium ≥ 45 · Low < 45**. Always surface the
explanation, which names the factors driving (and limiting) the score.

## Worked examples

- 11 sold comps, CV 9%, fresh (≤14d), PriceCharting agrees → 30+25+20+25 = **100 → High**.
- 4 sold comps, CV 18%, ~30d old, PriceCharting agrees → 18+18+14+25 = **75 → High**.
- 2 sold comps, CV 41%, fresh, no PriceCharting → 8+3+20+10 = **41 → Low**.
- 0 sold comps, PriceCharting only → capped at 35 → **Low**.
