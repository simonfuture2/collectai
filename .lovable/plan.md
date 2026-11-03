# Camera-first Price Check scanner (/scan/live)

A new full-screen camera page replaces the upload-then-results flow on phones. Point the camera at a card, and the app outlines it, captures it, and shows the price in a strip at the bottom. Nothing in this flow needs typing. The current price check, collection and pricing services are reused. The Lab, the current /scan page and the /price/:id page stay as they are.

## What gets built (in order)

1. **One tap to the camera**
   - The middle Scan button at the bottom and the Dashboard's main scan button open the camera directly.
   - A new "Scan card or barcode" button goes at the top of the Dashboard.
   - Signed-out visitors go to sign-up first.
   - On desktop, or when there's no camera, these buttons open the current upload page.
2. **Camera screen**
   - The camera fills the screen.
   - A mode chip (Price check, Add to collection, Insights) sits top left, and a close button top right.
   - The camera stops when you leave the page or switch tabs.
   - First visit shows an "Allow camera" explainer. If permission is denied, you get steps for iPhone and Android settings plus "Choose a photo instead".
3. **Live card outline**
   - A glowing outline follows the card's four corners, about 10 times a second.
   - The message pill changes with the state: "Point at a card", "Move closer", "Hold steady…" with a fill bar, then "Checking price…" in green.
   - It captures automatically once the card is steady and sharp. The card is straightened and cropped before it is sent for a price.
   - If the outline software can't load or the phone is too slow, fixed guide corners are used instead.
4. **Scanning loop**
   - One check runs at a time.
   - The same card held up again isn't re-scanned.
   - A buzz and an optional sound play on each result.
   - Errors show in plain words in the pill:
     - "Couldn't read that card – try less glare"
     - "Busy – trying again"
     - "You've hit 100 scans this hour – back in a few minutes"
   - Auto-capture pauses for 10 seconds after an error. After hitting the hourly limit it waits until you tap play.
5. **Right-side buttons**
   - Help: 4 picture tips.
   - Language: Any, English, Japanese, Korean, Chinese.
   - Auto or manual capture.
   - Flash: only on phones that support it.
   - Sound on or off.
6. **Bottom controls**
   - Game chip: Auto, Pokémon, One Piece, Magic, Yu-Gi-Oh!, Lorcana, Dragon Ball, Sports, Other TCG.
   - A large shutter button.
   - A Card | Barcode toggle. Barcode reads sealed products and puts them in the same strip.
   - A Review arrow.
   - A gallery button to scan a saved photo.
   - Language, game and sound choices are remembered.
7. **Results strip**
   - "Total value $X" counts up as cards are added.
   - Scanned cards scroll sideways, newest on the left. Each shows the straightened image, name, number, parallel, language flag, set, raw price and "+n matches".
   - A card can be removed with its X.
   - While a card is checking it shows a loading placeholder. When nothing matches it says "No match – tap to see options".
8. **Card sheet** (tap a card in the strip; drag down to close)
   - Prices: Ungraded, PSA 9, PSA 10 and BGS 10, with the PriceCharting credit.
   - "Is this the right card?": tap another match and the prices update.
   - Mode buttons:
     - Add to collection – free
     - Full analysis · cost
     - Save to Insights – free
   - "See sold listings" opens eBay.
   - Saved cards show a check badge.
9. **Review screen**
   - Shows every card from this session with tick boxes and the total.
   - "Add n to collection – free" or "Save n to Insights – free" saves them one by one with a progress bar and keeps going if one fails.
   - "Full analysis on selected · cost" warns first if you don't have enough credits.
   - "Keep scanning" and "Clear".
   - The session survives a page refresh.
10. **Small service changes**
    - Price check accepts a language hint.
    - The free save accepts "insight" as well as "collection".

## Testing and what I can't do here
- I can test in a headless browser with a fake camera video of a card. That covers outline load time, time per frame, time from card shown to price shown, the duplicate guard, and the save and review flow.
- I can't hold a real iPhone or Android phone, a sleeve, a toploader or a slab. Those reports need you to test on a device. I'll give you a short checklist, and the app will show a small timing readout for admins so you can read the numbers off.
- The project has no iPhone app folder yet, so the iPhone camera permission text goes in a note for when you add it. The Android camera permission is added now.
- After pulling the update, run `npx cap sync` for the Android build.

## Technical details
- New `src/pages/LiveScan.tsx` plus `src/components/live/*`: camera, overlay canvas, controls, strip, sheet and review.
- Detection lives in `src/lib/liveDetect.ts`, with all thresholds in a constants block at the top. Pure helpers (aspect check, EMA smoothing, dHash, Hamming distance, state machine, game→category map) get tests.
- `@techstark/opencv-js` is lazy-imported on this page only. Detection steps: gray → blur → Canny → dilate → contours → approxPolyDP. The capture is straightened to 630×880 with warpPerspective. Sharpness is Laplacian variance inside the outline.
- `@capacitor/haptics` gets installed, with `navigator.vibrate(15)` on the web.
- Each capture uploads to `card-images/{uid}/live-{ts}.jpg` at JPEG quality 0.85, then calls `price-check`. Changing the match uses the existing `select` action.
- `priceSession.ts` gets optional number, set, parallel, language, candidateCount and imagePath fields plus `removeFromSession`, with tests updated.
- `price-check`: optional `language`, passed through `normLanguage` and `languageBoost`. `price-check-save`: optional `scanPurpose`, which defaults to collection.
- `BottomNav` and Dashboard route by `matchMedia('(pointer: coarse)')` and whether a camera is available. Add `/scan/live` to App.tsx.
- Android manifest gets the CAMERA permission.
