# Open Price Check to every signed-in user (100/hour)

The 503 fix already passed its real-photo tests, so this can go ahead.

## 1. Turn it on for everyone
- Set `price_check_enabled` to true. It is already true, but I'll confirm the value.
- Keep the access check, the beta flag and the admin switch, so you can turn it off from admin.
- Visitors who aren't signed in and tap a price-check button go to sign-up, then come back to Price mode.

## 2. Limits
- 100 checks an hour, 400 a day.
- Limit messages use the numbers directly: "You've reached 100 price checks this hour. Try again in a few minutes." and "You've reached today's limit of 400 price checks. Try again tomorrow."
- Lab runs still skip the limits.

## 3. Remove beta-only wording
- Pack Rip: remove "Free Price Check isn't available on your account yet." and keep a loading state.
- Scan page and scan menu: Price check comes first and opens by default when no mode is chosen.
- Price check history shows for every signed-in user.
- One access check still controls all of this, so the admin switch keeps working.

## 4. Copy
- Scan menu subtitle: "Free with your account. Up to 100 cards an hour."
- Home page top text: "Try a free demo scan now · Create a free account for free price checks".
- Home page and Pricing Free plan: add "Free price checks (up to 100 cards an hour)" as the first item.
- FAQ "Do I need an account?": the new answer you wrote.

## 5. Checks
- A brand-new account with no beta flag can run a price check right after sign-up.
- The 101st check in an hour shows the new limit message. I'll test this by seeding 100 rows, then remove them.
- Turning the setting off hides Price mode again for non-beta users. I'll turn it back on after the test.
- A test for the limit numbers and messages.

## Technical details
- `price-check/index.ts`: HOURLY_LIMIT=100, DAILY_LIMIT=400, messages built from the constants. Redeploy.
- Signed-out redirect: `/auth?mode=signup&next=/scan?mode=price` (check that Auth honours `next`).
- Files: PackRip.tsx, Scan.tsx, ScanModeDrawer.tsx, PriceCheckHistory.tsx, use-price-check-access.ts, Index/home, Pricing, FAQ.
