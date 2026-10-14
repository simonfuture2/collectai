# Beta users scan freely for 90 days, then get asked to subscribe

## 1. Beta users can always scan inside their window
- The scanner itself already treats active beta as full access (fixed earlier today, now live).
- The Scan page still runs its own check before starting a scan. That check only looks at "pro", paid subscription or credits, so a beta user with 0 credits can still be stopped there. Change it to also allow active beta (same rule the rest of the app uses).
- Beta scans never use credits and get the Pro hourly limit (60/hour).

## 2. When the 90 days end, ask them to sign up to keep their collection
- Shown to users whose beta has ended and who have not subscribed.
- A one-time popup on next visit (Home, Collection, Scan): "Your free beta has ended. Subscribe to keep your collection." It shows card count and total value, the founder price ($6.99/month for 12 months) if they still qualify, a "Subscribe" button to the checkout, and "Not now".
- After "Not now", a slim banner stays at the top of Home and Collection with the same button.
- Their cards are never deleted. Viewing the collection still works; new scans fall back to free credits like any free user.
- Beta users get a heads-up at 7 days and 1 day left ("Your beta ends in 7 days — subscribe to keep your collection").

## 3. Check
- Signed in as a beta user with 0 credits: the Scan page lets you start a scan.
- Fake an ended beta in the test view: the popup and banner appear; subscribed users never see them.

## Technical details
- `src/pages/Scan.tsx` line ~122: add `data?.beta_active` to `allowed`.
- `src/hooks/use-credits.ts`: add `betaExpired` (beta_ends_at in the past, not subscribed).
- New `src/components/BetaEndedPrompt.tsx` (dialog + banner, dismissal in localStorage per user), mounted in Dashboard, Collection, Scan; reminder variant when `betaDaysLeft` is 7 or 1 or fewer.
- Checkout reuses the existing beta/founder checkout from Pricing. No database or pricing changes.
