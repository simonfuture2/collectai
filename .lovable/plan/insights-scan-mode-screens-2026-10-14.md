# Insights scan mode — screens

Build the screens from the brief on top of the existing Insights backend. Gold = Collection mode, azure (existing `secondary` token, 200 90% 45%) = Insights mode, everywhere. No changes to the scan pipeline, pricing or database.

## 1. Scan button chooser (BottomNav)
- Center Scan button opens a bottom drawer "What are you scanning?" with two large cards:
  - "Add to my collection" (Layers, gold) → `/scan?mode=collection`
  - "Insights only" (ScanSearch, azure) → `/scan?mode=insight`
- Link "View recent insights (N)" → `/insights`; N = insight scans in last 7 days, hidden when 0.
- Add `/insights` to app routes; Collection tab is active on `/insights`.

## 2. Scan page
- Mode from `?mode=` (default collection); sticky Collection | Insights segmented control updates the param.
- Title "Scan to Collection" / "Insight Scan"; insight subline "Won't be added to your collection. You can add it later."
- Insight-only fields above the button: Raw / Graded slab toggle, Asking price ($ prefix, decimal keypad), "Where are you?" (prefilled from and saved to session storage `mca-insight-event`).
- Sends scanPurpose, askingPrice, insightEvent to identify-card. If Graded slab: calls scan-slab with the same images before navigating, timeline stays visible.
- Button reads "Get Insights" in insight mode.
- Remove the dead result / save / reset code.

## 3. Reveal page
- Insight cards: azure pill "Insight · not in your collection"; Deal Check block (asking price, range, verdict chip green/muted/red with "+12% vs market") once value is ready; inline "Enter asking price" input when none, saves and shows verdict instantly.
- Actions: "Scan next card" → insight scan (event kept); "Add to Collection" → move, toast, switch to collection layout in place; "Discard" → delete row + stored image, go to `/insights`.
- Collection cards: replace the no-op "Add to Collection" with "Scan another"; keep "See Full Analysis".

## 4. New Insights page (`/insights`)
- Current user's insight cards, newest first, grouped by event, then Today / Yesterday / date.
- Row: thumbnail, name, set · year, condition or slab grade, value range (shimmer while analyzing), asking price + deal chip. Tap → reveal page. ⋯ menu: Add to Collection, Delete.
- Filters All | Raw | Graded; sort Newest | Highest value | Best deal. Select mode with bulk Add / Delete.
- Empty state per brief with "Start an insight scan".
- Live status: refreshes every 5 seconds while any row is still analyzing (cards no longer broadcast live changes since an earlier security fix, so this matches how the reveal page already stays current).

## 5. Entry points
- Collection: header tabs "My Collection | Insights (count)".
- Dashboard: compact Insights card with last 3 scans + "See all".
- Card detail for insight cards: azure banner with "Add to Collection"; hide Make Public, List on Marketplace, pairing and AuthentiSeal actions.

## 6. Check
- Walk the whole flow at 375px in light and dark themes with a signed-in account, including one insight scan, deal check, add to collection and discard.

## Technical details
- New: `src/pages/Insights.tsx` (lazy route, SEO noIndex), `src/components/ScanModeDrawer.tsx`, `src/components/DealChip.tsx`, `src/hooks/use-insight-count.ts`.
- Edited: BottomNav, Scan, ScanReveal, CardDetail, Collection, Dashboard, App.
- Uses `dealVerdict` / `moveInsightToCollection` from `src/lib/insights.ts`; signed-URL helper reused from ScanReveal (extracted to a small shared util).
- Deal chip colors via semantic tokens (success/destructive/muted); add a `success` token to the stylesheet if missing.
