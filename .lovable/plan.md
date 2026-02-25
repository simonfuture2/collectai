

# Growth Features: Referral System, Shareable Certificates, SEO Meta Tags, Public Collections

## Overview

Four growth features to drive organic user acquisition and improve discoverability.

---

## Feature 1: Referral System (3 bonus credits per referral)

### Database Changes
- New `referrals` table:
  - `id` (uuid, PK)
  - `referrer_id` (uuid, NOT NULL) — the user who shared the code
  - `referred_id` (uuid, NOT NULL, UNIQUE) — the user who signed up
  - `referral_code` (text, NOT NULL) — the code used
  - `credited` (boolean, default false) — whether bonus was awarded
  - `created_at` (timestamptz)
- Add `referral_code` column to `profiles` table (text, UNIQUE) — each user gets a unique code auto-generated on signup
- RLS: users can read their own referrals, insert handled by edge function

### Backend
- Modify the existing signup flow: after a user signs up, generate a unique referral code (e.g., 8-char alphanumeric) and store it in `profiles.referral_code`
- New edge function `redeem-referral`: validates a referral code, creates the `referrals` row, and awards 3 credits to the referrer via `user_credits` + `credit_transactions`
- Database trigger on `profiles` insert to auto-generate referral code

### Frontend
- **Dashboard**: Add a "Refer a Friend" card showing the user's referral code, a copy button, and a share button (Web Share API with fallback)
- **Auth page**: Accept optional `?ref=CODE` query param; store in localStorage, then call `redeem-referral` after successful signup
- **Dashboard**: Show referral stats (total referrals, credits earned)

### Files
- New: `supabase/functions/redeem-referral/index.ts`
- Modified: `src/pages/Auth.tsx` (capture ref param)
- Modified: `src/pages/Dashboard.tsx` (referral card)
- New component: `src/components/ReferralCard.tsx`
- Migration: new table + profile column + trigger

---

## Feature 2: Shareable AuthentiSeal Certificates

### Approach
- Add a "Share" button on the CardDetail page next to grading results
- Generates a shareable URL like `/card/share/{cardId}` that shows a public, read-only card summary with CollectAI branding
- Add Open Graph meta tags to the share page for rich social media previews

### Database Changes
- Add `is_public` column (boolean, default false) to `cards` table
- New RLS policy: allow anonymous SELECT on cards where `is_public = true` (read-only, limited columns)

### Backend
- New edge function `generate-share-card`: generates a simple OG image or returns card metadata for social previews
- Or simpler: the public share page reads the card data directly via the new RLS policy

### Frontend
- New page: `src/pages/SharedCard.tsx` — public view of a card with CollectAI branding, grade, value range, and a CTA "Scan your own cards" linking to signup
- New route: `/card/share/:id`
- CardDetail page: add "Share" button that sets `is_public = true` and copies the share URL
- Include OG meta tags via a simple `<Helmet>`-like approach or edge function for SSR meta

### Files
- New: `src/pages/SharedCard.tsx`
- Modified: `src/pages/CardDetail.tsx` (share button)
- Modified: `src/App.tsx` (new route)
- Migration: `is_public` column + RLS policy

---

## Feature 3: SEO Meta Tags & Open Graph

### Approach
- Add comprehensive meta tags to `index.html` for default SEO
- Add `react-helmet-async` for per-page meta tags (or use simple document.title updates)
- Focus on landing page, pricing, about, and how-it-works pages

### Implementation
- Update `index.html` with: title, description, OG title/description/image/url, Twitter card meta, structured data (JSON-LD for SoftwareApplication)
- Use the combo graphic as the default OG image (host at a public URL)
- Add canonical URLs

### Files
- Modified: `index.html` (meta tags, structured data)
- Modified: Landing, Pricing, About pages (page-specific titles via `useEffect` + `document.title`)

---

## Feature 4: Public Collection Pages

### Database Changes
- Add `public_collection_enabled` (boolean, default false) and `public_collection_slug` (text, UNIQUE, nullable) to `profiles` table
- New RLS policy: allow anonymous SELECT on profiles where `public_collection_enabled = true`
- New RLS policy: allow anonymous SELECT on cards where user has public collection enabled

### Frontend
- New page: `src/pages/PublicCollection.tsx` — displays a user's collection publicly with CollectAI branding and a CTA
- New route: `/u/:slug`
- Dashboard: add "Share Collection" toggle in a settings section — when enabled, generates a slug and shows the public URL
- The public page shows cards in a grid (image, name, grade, value) with the user's display name

### Files
- New: `src/pages/PublicCollection.tsx`
- New component: `src/components/PublicCollectionToggle.tsx`
- Modified: `src/pages/Dashboard.tsx` (toggle)
- Modified: `src/App.tsx` (new route)
- Migration: profile columns + RLS policies for public access

---

## Implementation Order

1. **SEO Meta Tags** — quickest win, no backend changes
2. **Referral System** — migration + edge function + Auth/Dashboard changes
3. **Shareable Certificates** — migration + new page + CardDetail changes
4. **Public Collections** — migration + new page + Dashboard toggle

## Technical Notes

- No new npm dependencies needed (Web Share API is native; document.title for page titles)
- All public pages include a prominent CTA back to `/auth` for conversion
- RLS policies for public features allow anonymous read of specific columns only
- Referral credits use the existing `credit_transactions` system for consistency

