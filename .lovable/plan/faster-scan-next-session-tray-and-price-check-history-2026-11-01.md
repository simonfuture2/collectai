# Faster "Scan next", session tray, and price check history

## 1. "Scan next" back to the camera in under a second
- The scan page is preloaded while the result page is open, so going back doesn't wait on a download.
- Returning in price mode skips the sign-in and access re-checks the page already did this session (cached for the session), and opens straight on the ready "Take photo" box with nothing else loading first.
- Phones only open the camera after a tap (browser rule), so "under a second" means the camera button is ready to tap, not that the camera opens by itself.

## 2. Session tray at the top of price mode
- A slim horizontal strip above the photo box: up to 20 price checks from this session, each a small thumbnail + ungraded price ("—" when there is no match), sorted highest value first.
- Tapping one opens its result page.
- "This session" = since the app tab was opened (kept until the tab closes). Choosing a different match on a result page updates that item's price in the tray.
- Hidden when the session has no checks yet.

## 3. "Price check history" on the Dashboard account section
(There is no separate profile page; this sits with Referrals, Connected accounts and Transactions on the Dashboard.)
- Shown only to people who can use Price Check.
- Newest first: thumbnail, card name, set, ungraded price, date. Tap to open the result page.
- Delete button per row with a confirm. Loads 20 at a time with "Show more".

## Technical details
- New `src/lib/priceSession.ts`: sessionStorage list of `{ priceCheckId, imagePath, name, price, at }`, `addToSession`, `updateSessionPick`, `sessionTray()` (top 20 by price desc, nulls last) with adjacent tests for sorting, the 20 cap and replace-on-duplicate.
- Scan.tsx calls `addToSession` after a successful `price-check`; PriceResult calls `updateSessionPick` after a match change and `import("./Scan")` on mount to preload.
- `usePriceCheckAccess` caches its answer in sessionStorage per user so the returning scan page renders instantly.
- Thumbnails: signed URLs for the user's own card-images paths, batched in one `createSignedUrls` call; tray thumbnails reuse the local photo preview when still available.
- History reads `price_checks` directly (users already can read and delete their own rows); delete removes the row only, never the photo or any collection card.
