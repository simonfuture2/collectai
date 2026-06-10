# Confidence Scoring

Turns the raw comps into a single High / Medium / Low confidence label. Read this before reporting confidence in step 4 of the workflow.

The point of the score is to keep the estimate honest. A $500 number from one stale sale and a $500 number from twelve recent tightly-clustered sales are not the same claim, and the user needs to see the difference.

## The three factors

### 1. Comp count
How many qualifying sold comps came back (within the config's recency window).
- **Strong:** ≥ `min_comps_for_high_confidence` (8 by default)
- **Moderate:** 3–7
- **Weak:** 1–2
- **None:** 0 — do not report a value; report "insufficient comps"

### 2. Price dispersion
How tightly the comps cluster, measured as coefficient of variation (standard deviation ÷ mean).
- **Strong:** CV ≤ 0.15
- **Moderate:** 0.15–0.35
- **Weak:** CV > 0.35 (the market disagrees with itself; the point estimate is shaky)

### 3. Recency
How fresh the most recent comps are.
- **Strong:** multiple sales in the last 30 days
- **Moderate:** sales in the last 90 days
- **Weak:** newest sale older than the recency window

## Combining into a label

Take the *weakest* of the three factors as the ceiling, then adjust:

- **High** — all three strong
- **Medium** — no factor is weak, but not all are strong
- **Low** — any single factor is weak

Always name the single biggest limiting factor in the output. The user should never have to ask "why is this only medium?"

## Worked examples

**Example 1**
Input: 11 comps, CV 0.09, four sales in the last 2 weeks
Output: High — tight cluster, strong recent volume

**Example 2**
Input: 6 comps, CV 0.12, newest sale 60 days ago
Output: Medium — limited by recency (no sales in the last month)

**Example 3**
Input: 2 comps, CV 0.41, one sale this week
Output: Low — limited by comp count (only 2 sales, and they disagree widely)
