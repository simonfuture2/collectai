# Plan: Show graded-version sold data in the card detail

## What we already have (server side)

`enrich-card` already runs a per-grade Firecrawl pass (`PSA 10 sold site:ebay.com`, `PSA 9 sold site:ebay.com`, `BGS 9.5 sold ...`, etc.) and builds a `gradedComps` object:

```ts
gradedComps: {
  psa: { "10": { median, low, high, count, prices: number[] } | null, "9": ..., "8": ... },
  bgs: { "10": ..., "9.5": ..., "9": ... },
  cgc: { ... }, sgc: { ... }, tag: { ... }
}
```

This is already persisted on the card row inside `ai_analysis.extractedMarketData.gradedComps`. **The UI just doesn't render it yet** — `GraderCard` shows a per-grade dollar number with no underlying comp evidence.

## What's missing (UI)

The user (and Anthropic's critique) want to see the actual sold comps that back each PSA/BGS/CGC/SGC/TAG tier — not just a number. So we surface what's already in the database.

## Changes

### 1. `src/pages/CardDetail.tsx` — read & display `gradedComps`

- Pull `analysis.extractedMarketData?.gradedComps` alongside the existing `gradedValueEstimates`.
- Update `GraderCard` so each grade row shows:
  - The median dollar value (existing behavior).
  - A muted "n sold" pill next to it (e.g. `$151 · 7 sold`) when `gradedComps[grader][grade]` has comps.
  - When `count === 0` → keep current "No sold comps" italic state.
- Add a small collapsible "Sold comps" disclosure under each grade tier that has comps, listing:
  - Low / median / high (formatted dollars).
  - Up to ~8 individual sale prices (`comp.prices`), sorted desc.
  - A "View on eBay" link that opens the same `"<card name>" <grade> sold site:ebay.com` query in a new tab so the user can audit the source.
- When *no* tier for a grader has comps, show a single muted line: *"No graded sold comps found in last 30 days."*
- Confidence badge logic stays as-is (already grounded in real comp counts).

### 2. `src/pages/CardDetail.tsx` — top-level "Per-grade comps" summary

Above the grader grid, add a compact strip when any `gradedComps` exist:

```
Real sold comps · PSA 10 (3) · PSA 9 (7) · BGS 9.5 (2) · CGC 9.5 (1)
```

Tiers with `count === 0` are omitted. This gives the user instant signal that real per-grade data was retrieved (the thing Anthropic flagged as missing trust).

### 3. Types

Extend the local `AIAnalysis`/`extractedMarketData` interface in `CardDetail.tsx` with a `gradedComps` field matching the server shape. No DB migration needed — the data is already in `ai_analysis` JSON.

## Out of scope (already done in previous pass)

- Per-grade Firecrawl retrieval (already implemented).
- Null-out for ungrounded tiers (already implemented).
- Raw-vs-graded reconciliation gate (already implemented).
- Honest "Limited market data" badge (already implemented).

## Files touched

- `src/pages/CardDetail.tsx` — only the `GraderCard` component, its container, and the analysis type.

## How we'll know it worked

Re-open the Jordan card. Each grader tile shows real sold counts where Firecrawl found comps, and a collapsible list of the actual sale prices with an eBay deep-link. Tiers with no comps stay honest ("No sold comps") instead of inventing a number.
