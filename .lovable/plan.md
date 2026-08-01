## 1. Persistent "Already verified" indicator on slab cert

Today `AuthenticatedProfile.tsx` holds verification result only in local state (`verifyUrl`, `reachable`), so it disappears on reload and the button always reads "Verify slab cert".

Changes (presentation + a small record write, no pipeline changes):

- On a successful `verify-slab-cert` call, persist the result on the card's `authentication_data` JSON: `cert_verified_at` (timestamp), `cert_verify_url`, `cert_verified_company`, `cert_verified_number`. Written with a normal authenticated update to `public.cards` (owner RLS already allows it). No schema change.
- On render, if `authentication_data.cert_verified_at` exists **and** the stored company/cert match the current card values, show:
  - a green "Verified" chip in the Authenticated Profile header (`BadgeCheck`, emerald), with the verified date on hover/subtext,
  - the action button relabelled "Re-verify cert" (secondary style) instead of the primary "Verify slab cert",
  - the "Open on {company}" link shown immediately from the stored `cert_verify_url`, without requiring a fresh verify call.
- If the stored cert number no longer matches (cert edited or re-scanned), the badge is suppressed and the primary "Verify slab cert" button returns.
- Keep the existing amber "couldn't auto-verify" copy for `reachable === false`.

## 2. Graded market value in AI vs Reality

`AIAccuracyCard` receives `actualValueMid` from the raw `estimated_value_low/high` DB columns, which is the number that can disagree with the graded headline (the hero already resolves a separate `valueAtConfirmedGrade`).

- Lift the graded-value resolution in `CardDetail.tsx` out of the hero IIFE (or compute it once above) so both the hero and `AIAccuracyCard` consume the same figure, using the existing precedence: `gradedValueEstimates[company].valueAtGrade` → eBay graded average (`ebayRecentSales.averagePrice`) → eBay graded low/high midpoint → stored DB range.
- Pass that resolved value as `actualValueMid` for confirmed slabs; non-graded cards keep the current DB-column behaviour.
- In `AIAccuracyCard.tsx`, label the figure with its source when a confirmed grade exists — e.g. "Graded market · BGS 8" plus a small caption "based on recent eBay sold comps" — so it visibly ties to the same comps as the rest of the page. The "% vs AI" delta recalculates from the corrected value automatically.

## Technical notes

- Files touched: `src/components/AuthenticatedProfile.tsx`, `src/components/AIAccuracyCard.tsx`, `src/pages/CardDetail.tsx`.
- No changes to `analysisEngine.ts`, `enrich-card`, pricing logic, or Stripe.
- The recent preview error ("failed to fetch dynamically imported module CardDetail.tsx") is a stale HMR chunk; it will be confirmed cleared after the edits.
