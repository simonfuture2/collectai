# Sealed product scanning — screens

Builds on the existing sealed backend. Presentation only, plus one small new backend function (sealed-rematch). Gold = Collection, azure = Insights, unchanged.

## 1. Scan page
- Replace Raw / Graded toggle with a 3-way switch in both modes: Card | Graded slab | Sealed pack/box. Send `itemType` to identify-card; Graded slab keeps calling scan-slab afterwards.
- Sealed: slots "Front of package" and "Barcode (optional)", hint text, "Scan barcode" button (browser BarcodeDetector, fallback @zxing/browser), digits shown with X to clear, small manual input. Sent as `upc`. Button reads "Find chase cards". Asking price and "Where are you?" unchanged.

## 2. Result page (sealed layout)
- Header: photo, product name, set, kind badge, Japanese badge, Insight pill.
- AI summary paragraph with small label.
- Sealed market price + "PriceCharting · updated …"; Deal Check chip vs sealed range when asking price present; otherwise "No sealed sales data yet" + sold-listings link.
- Top 5 chase cards: ranked rows (name/number, raw price, muted PSA 10, "Thin market" tag, Sold listings link), partial-list note for sports, always-on rarity disclaimer.
- Not matched: message, "Did you mean…?" candidate buttons calling sealed-rematch, sold-listings link.
- Collapsible "Buying sealed at a show" tips (3 given lines).
- Actions as other scans; shimmer while analyzing.

## 3. Insights page
- Sealed rows: package icon, product name, sealed price, "Top chase: … · $…". Filters All | Raw | Graded | Sealed.

## 4. Card detail
- Sealed items reuse the same sealed sections; hide pre-grade, defect map, grade ladder, pairing, AuthentiSeal.

## 5. Collection
- Package badge on sealed tiles; "Sealed" filter.

## 6. Home page
- Chip "Sealed packs & boxes → see the top chase cards"; Card Show Mode second "Example" line for the One Piece box.

## Testing
- 375px light and dark, signed in; one sealed scan with barcode and one without (uses real scans; test rows deleted afterwards).

## Technical details
- New shared component `src/components/sealed/SealedResult.tsx` (+ ChaseList, BarcodeScanner) used by ScanReveal and CardDetail.
- identify-card: accept `itemType`/`upc` if not already (verify; validated, no credit/limit change).
- New edge function `sealed-rematch` { cardId, consoleName }: auth + ownership check, reuses `_shared/sealed.ts` buildChase* and updates `ai_analysis` for that row only. No schema changes.
- Add dependency `@zxing/browser`, lazy-loaded only when BarcodeDetector is missing.
