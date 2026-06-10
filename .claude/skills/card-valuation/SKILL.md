---
name: card-valuation
description: Use this skill whenever a user wants to identify a trading card and estimate its market value from a scan or photo. This includes extracting the player or character, set, year, card number, and parallel/variant from a card image; matching it against the scan library; pulling sold comparables from PriceCharting and eBay; producing raw and graded value estimates; and returning a confidence score derived from comp count, price dispersion, and recency. Make sure to use this skill whenever a user uploads a card image, asks what a specific card is worth, requests a "price," "comp," or "valuation," or mentions pre-grading — even if they don't use the word "value." Do NOT use this skill for non-card collectibles, for general market-trend questions not tied to a specific card, or when the user only wants the card identified without a valuation.
---

# Card Valuation

Identify a single trading card from an image and produce a defensible market valuation. The output is only as trustworthy as the comparable sales behind it, so the workflow is built around finding real sold comps and being honest about how strong they are.

## Workflow

Follow these steps in order. Don't skip the confidence step — an estimate without a confidence signal is worse than no estimate, because it invites false certainty.

### 1. Identify the card

From the image, extract:

- **Subject** — player or character name
- **Set and year** — e.g., "2003 Topps Chrome"
- **Card number** — including any prefix (e.g., "RC-15")
- **Parallel / variant** — base, refractor, numbered, autograph, etc.

If any field is ambiguous from the image alone, say so explicitly rather than guessing. A wrong parallel can change value by 10x, so an unsure parallel must be flagged, not assumed.

### 2. Pull sold comparables

Run the comp fetcher, which reads the source configuration and queries each enabled source:

```bash
python scripts/fetch_comps.py --subject "<subject>" --set "<set>" --number "<number>" --variant "<variant>"
```

The sources, their weights, and freshness windows are defined in `config/pricing-sources.json`. Treat that file as the single source of truth — do not hardcode which sites to query or how recent a sale must be. To change behavior (add a source, reweight, tighten recency), edit the config, not this skill. See `config/pricing-sources.json` for the schema.

### 3. Produce raw and graded estimates

Report the raw (ungraded) value from the raw comps. For graded values, use **actual graded sold comps at each grade**, not a multiplier applied to the raw price. Multiplier-based graded ladders inflate prices and will not survive scrutiny — if there are no graded comps at a given grade, report that grade as "no comps" rather than inventing a number.

Map any visual pre-grade assessment to a grade band using `references/grading-rubric.md`. Read that file before assigning a pre-grade.

### 4. Score confidence

Compute a confidence score from comp count, price dispersion, and recency, per the method in `references/confidence-scoring.md`. Read that file before reporting confidence. Always surface the score alongside the estimate and name the single biggest factor dragging it down (e.g., "only 2 comps in the last 90 days").

## Output format

Present results as:

```
[Year Set] [Subject] #[Number] — [Variant]

Raw value:     $XX  (N comps, last sale [date])
Graded ladder: PSA 10 $XX (N comps) · PSA 9 $XX (N comps) · ...
Confidence:    [High/Medium/Low] — [biggest limiting factor]
```

Lead with identification, then value, then confidence. Never present a graded number without its comp count next to it.

## Bundled resources

- `config/pricing-sources.json` — which sources to query, their weights, and recency windows. Read/edit for any change to sourcing behavior.
- `scripts/fetch_comps.py` — deterministic comp fetcher. Run it; don't reimplement comp-gathering inline.
- `references/grading-rubric.md` — visual condition → grade band. Read before assigning a pre-grade.
- `references/confidence-scoring.md` — the confidence formula and worked examples. Read before reporting confidence.
