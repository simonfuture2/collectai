# Prepare the Android app for its first Google Play closed test

The website stays exactly as it is. Only the installed Android app changes.

## What Android users will see
- **No purchases:** wherever there was a buy, upgrade, Go Pro or manage-subscription button (Pricing page, upgrade popup, Profile, card pages), they see "Plans are coming soon to the Android app." Their current plan and credits still show, and anything bought on the website keeps working.
- **Out of credits:** "You're out of credits for full analysis. Free price checks are still available." There's no purchase link.
- **No marketplace:** the Market tab, "List for sale" buttons, wallet settings and USDC/USDT wording are all hidden. Opening a marketplace link sends them to their collection with the message "The marketplace isn't available in the Android app."
- **Sign-in:** email only (Google stays hidden, as it is now).
- **Delete account:** a "Delete account" button on Profile opens the delete-account page, two taps from anywhere.

## Technical details
- New `src/lib/platform.ts` with `isAndroidApp()` (native and platform android). Every check uses it, with a small test.
- Purchase guards: `Pricing.tsx`, `UpgradeModal.tsx`, customer-portal and credit/Pro buttons in `Dashboard.tsx`, `CardDetail.tsx`, `AnalysisProgress.tsx` and the reanalyze cost buttons. These get a shared `<AndroidPlansNotice />`.
- Marketplace: hide the tab in `BottomNav.tsx`, and add a route guard in `App.tsx` for /marketplace*, create-listing, escrow/order and wallet routes (redirect plus toast). Hide list-for-sale in `CardDetail.tsx` and the crypto mentions in `Landing.tsx`, `Footer.tsx` and `Pricing.tsx`. `Web3Provider`/appkit become lazy-loaded and wrap only marketplace/wallet routes, so Android never loads them.
- `AndroidManifest.xml`: add the `com.android.vending.BILLING` permission and change MainActivity `launchMode` from `singleTask` to `singleTop`.
- `build.gradle`: `versionName "1.0.0"` and `versionCode 2`. Each later upload raises it by 1, and this goes in AGENTS.md.
- Verification: Playwright with a mocked Capacitor android platform takes screenshots of Pricing, the bottom bar, a card page and Profile. The same pages are then captured as the website to confirm Stripe checkout and the marketplace are unchanged.
- After this, pull the code and run `npx cap sync android` before building the .aab.
