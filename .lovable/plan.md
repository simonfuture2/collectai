

## Plan: Add Prominent Re-Scan Button to CardDetail Page

### Problem
The re-scan button on the CardDetail page is hidden inside the price history chart header (line 677), which is far down the page. Users expect a prominent, easily discoverable re-scan action near the top of the card.

### Changes

#### `src/pages/CardDetail.tsx`
1. **Add a prominent "Re-Scan" button** in the Quick Stats area (around line 458-476), next to the Estimated Value card. This will be a clearly labeled button with the `RefreshCw` icon and "Re-Scan" text, placed below the value/condition stats grid.
2. The button will call the existing `rescanPrices()` function and show a spinner while scanning.
3. Keep the small refresh icon in the price history section as-is (secondary access point).

The button will look something like:
```
[Quick Stats Grid: Value | Condition]
[🔄 Re-Scan Prices] ← new prominent button here
```

Single file change, ~5 lines added.

