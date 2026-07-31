## 1. Admin "Beta" tab

New tab in the admin portal (`/admin`) alongside Users, Transactions, Leads, Campaigns, Push, Admins.

**What it shows** — one row per user with:
- Email / display name
- Beta window status: Active (with days left), Expired, or None
- Window end date
- Founder price locked (yes/no + date locked)
- Current plan and whether they have a live subscription

Filters: All / Active beta / Expired / Price-locked. Plus the same search box style used on the Users tab.

**What an admin can do per user**
- **Grant / extend a beta window** — pick a duration (30 / 60 / 90 days or a custom end date). Sets the eligibility flag and the access-until date.
- **Revoke beta window** — clears the access-until date and the eligibility flag immediately, so the user drops back to free/credits on their next status refresh.
- **Lock founder pricing** — marks the user as price-locked manually (for support/goodwill cases).
- **Unlock founder pricing** — clears the lock, so their next checkout pays the standard $14.99.

Each action writes an audit row into the existing transaction log (e.g. `admin_beta_grant`, `admin_beta_revoke`, `admin_price_lock`) so it shows up in the Transactions tab.

A small summary strip at the top of the tab: total in active beta, total expired-but-eligible, total price-locked.

## 2. Backend

Extend the existing `admin-data` edge function with new actions — same admin-only auth guard the other actions already use:
- `set_beta_window` — target user + end date (or `null` to revoke) + eligibility flag
- `set_price_lock` — target user + lock/unlock

Both validate input, are rejected for non-admins, and log an audit transaction. No schema change is needed — the `beta_access_until`, `beta_eligible`, and `beta_price_locked_at` fields already exist, and the dashboard query already returns them.

Note: revoking a window does **not** cancel an existing Stripe subscription or remove a discount already applied at checkout — Stripe controls the coupon once a subscription is live. Unlocking only affects future checkouts. This will be stated in the UI so it isn't misleading.

## 3. Home page promo banner

A dismissible promo banner on the landing page (`/`), placed just above the hero:

> **Beta Founder offer** — Join now for 30 days of full Pro access, then lock in $6.99/mo (50% off) for 12 months. Offer ends September 30, 2026.
> [Claim your spot →]

- Gold/amber styling matching the existing beta banners on the dashboard and pricing page.
- CTA goes to `/auth` for signed-out visitors, `/pricing` for signed-in users.
- Auto-hides after the cutoff date and for users who already have an active paid subscription.
- Dismissal remembered in local storage so it doesn't nag on every visit.

## Technical notes

- New files: `src/components/admin/BetaTab.tsx`, `src/components/BetaPromoBanner.tsx`.
- Edited: `src/pages/Admin.tsx` (tab wiring), `src/pages/Landing.tsx` (banner), `supabase/functions/admin-data/index.ts` (two new actions), then redeploy that function.
- No changes to the scan pipeline, pricing engine, or Stripe checkout logic.
