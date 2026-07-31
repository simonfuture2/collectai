## Goal

Anyone who signs up before a cutoff date gets 30 days of full (Pro-level) access. When it ends they drop to free, and they're offered Pro at **$6.99/mo for 12 months** (instead of $14.99), after which it renews at standard price. The discount is forfeited if they cancel or let Pro lapse.

## How it works

```text
signup (before cutoff)  ->  beta_until = signup + 30 days   [full access]
        |
   day 30 expiry        ->  plan back to free + banner: "Lock in $6.99/mo"
        |
   checkout w/ beta     ->  Stripe Pro subscription + 12-month repeating coupon
        |
   month 13             ->  renews at $14.99 automatically
```

### 1. Data
Add to `user_credits` (migration):
- `beta_access_until` (timestamptz, null) — end of the 30-day full-access window
- `beta_eligible` (boolean, default false) — earned the $6.99 lock-in offer
- `beta_price_locked_at` (timestamptz, null) — set when they actually subscribe on the beta deal

A signup trigger (extends the existing new-user credits trigger) sets both fields when `now() < BETA_CUTOFF`. Cutoff stored as a single constant so it's easy to change.

### 2. Pricing / Stripe
- Create a Stripe coupon: 53.37% off, `duration: repeating`, `duration_in_months: 12`, applied to the existing Pro price (`price_1T5Ept…`) so the effective price is $6.99/mo for a year, then $14.99. No second product needed, so upgrades/cancellations keep working as-is.
- `create-checkout` accepts an optional `beta: true` flag; it re-verifies eligibility server-side from `user_credits` (never trusts the client) and only then attaches the coupon.
- `stripe-webhook` stamps `beta_price_locked_at` on activation. On `customer.subscription.deleted` it clears beta eligibility, so a cancelled user cannot re-claim the discount.

### 3. Access gating
- `check-subscription` returns `beta_active`, `beta_ends_at`, `beta_eligible`. If `beta_access_until > now()` it reports the user as Pro-equivalent (`plan: "beta"`, treated as Pro) without touching Stripe.
- `useCredits` exposes `isPro` true during beta, plus `betaEndsAt` / `betaEligible` — so every existing Pro gate works untouched.

### 4. UI
- `CreditBalance`: gold "Beta • N days left" badge during the window.
- Dashboard banner: countdown during beta; after expiry, a "Lock in $6.99/mo" card.
- `UpgradeModal` + `/pricing`: for eligible users show $14.99 struck through, $6.99/mo highlighted with "first 12 months, then $14.99" fine print.
- Non-eligible users see the current pricing unchanged.

## Notes
- No beta-user cap (unlimited before the cutoff date), as left unspecified — easy to add later.
- Credits are untouched; beta users simply bypass the credit check while active.
- No changes to the scan pipeline, analysis engine, or pricing logic.
