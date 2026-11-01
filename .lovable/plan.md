# Better price-check matches + accuracy tracking

## What changes for users
1. **Slabs:** if the photo shows a graded slab, the photo reader also reads the grading company and grade (e.g. PSA 9). The result page opens with that grade's price as the headline, highlighted in the grade chips, with a "Graded · PSA 9" label. If PriceCharting has no price for that grade, it says "No PriceCharting data for this grade" (no guessing) and still shows the ungraded price below.
2. **Parallels grouped:** versions of the same card (holo, reverse holo, 1st edition, numbered colour parallels) sit side by side in the bottom carousel, each with a small parallel label ("Reverse Holo", "1st Edition", "Gold /50"). The best group comes first; within it, the version matching what was read leads.
3. **Language:** if Japanese or Korean text is read, Japanese products rank higher, and a language chip ("Japanese" / "Korean") shows next to the card name and on matching carousel cards.
4. **Accuracy tracking:** when someone picks a match other than the first, its position (2, 3, ...) is recorded. A new **Match accuracy** tab in Admin shows, per game, % right at #1 and % in the top 3, as a bar chart plus a small table with check counts (last 30 days, with a 7/30/90-day switch).

## Technical details
- `price-check/index.ts`
  - Gemini prompt adds `slab: {company, grade}` (or null), `language` restricted to english/japanese/korean/other. Token cap stays small.
  - New pure module `price-check/ranking.ts` (+ tests): `slabRung(company, grade)` reusing the grade→rung map from `_shared/pcValuation.ts`; `parallelKey/baseKey` (strip bracketed parallel + "1st edition"/numbering from names); `groupParallels(candidates)` keeps groups contiguous, ordered by best score; language boost (+15 Japanese product when JP/KR read, −10 otherwise).
  - Response and `identification` include `slab`, `rung`, `language`. Each candidate carries `parallel` label and `rank` (original position).
  - `select` action records `picked_rank` (1-based position in the saved list; search picks recorded as 0 = "not in list").
- Migration: `price_checks` add `picked_rank int`, `game text`. Admin-only SECURITY DEFINER function `price_check_accuracy(_days int)` returning game, total, top1_pct, top3_pct (unpicked checks count as #1 correct; only checks with a candidate list counted). Grant execute to authenticated; function checks `is_admin`.
- `src/lib/priceLadder.ts`: `rungLabel`, chip for pre-selected rung; tests updated.
- `PriceResult.tsx`: pre-selected rung hero, language chip, parallel labels in carousel.
- `Admin.tsx`: new "Match accuracy" tab, lazy component using recharts.
- Tests: ranking grouping, slab rung mapping (PSA 10 → manual-only, BGS 10 → bgs-10), language boost, accuracy % math.

## Not verifiable yet
Real photos still fail on the photo-reader billing error, so slab/language reading will be tested with saved sample rows only.
