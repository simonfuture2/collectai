

## Plan: Add Re-Scan Button to Collection Cards + Fix White Text

### Problem
1. No way to re-scan/update card values from the Collection grid view — users must open each card's detail page
2. The estimated value text on the CardDetail page uses `bg-gradient-primary` with `text-primary-foreground` (white) on a gradient background, which may appear invisible depending on theme

### Changes

#### 1. Add Re-Scan button to Collection grid cards (`src/pages/Collection.tsx`)
- Import `RefreshCw` icon from lucide-react
- Add a Re-Scan button next to the delete button in each grid card's footer
- On click, invoke the `analyze-card` edge function (full analysis, not just pricing) with the card's existing image URL
- Update the card's state in-place with the new analysis results (name, grade, values)
- Show a spinner on the button while scanning
- Add re-scan state tracking (`rescanningId`) to know which card is being re-scanned

#### 2. Add Re-Scan to list view (`src/pages/Collection.tsx`)
- Add a small re-scan icon button in the actions column of the table view as well

#### 3. Fix estimated value text visibility (`src/pages/CardDetail.tsx`)
- Line 461: The "Estimated Value" card uses `bg-gradient-primary text-primary-foreground` — the child `<p>` tags inherit white text which should be visible on the gradient. However, line 466 uses `opacity-70` on the range text which may be hard to see.
- Ensure the value text explicitly uses `text-white` (or `text-primary-foreground`) so it's always visible regardless of theme, since the background is always a purple-blue gradient.

#### 4. Re-scan function logic
- Reuse the existing `analyze-card` edge function which already handles full re-analysis
- Pass the card's stored `image_url` (the storage path, not the signed URL) so the edge function can re-process it
- On success, update the local `cards` state array with new values from the response
- The edge function already updates the DB row, so we just need to refresh local state

### Files to change
| File | Changes |
|------|---------|
| `src/pages/Collection.tsx` | Add `RefreshCw` import, `rescanningId` state, `rescanCard()` handler, Re-Scan button in grid and list views |
| `src/pages/CardDetail.tsx` | Change value text classes to explicitly use `text-white` instead of relying on `text-primary-foreground` |

