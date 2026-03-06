

## Current State

- **Lead generation page**: The partner signup page is at `/partners` (PartnerSignup.tsx). It captures name, email, phone, company, and message into the `leads` table. There's also the QuickScanChallenge on the landing page for anonymous lead gen.
- **Landing page header**: Only has logo + Sign In button. No navigation links to Partners, How It Works, or other pages.
- **No lead magnet / digital product**: There's no email capture mechanism that offers a free digital product in exchange for an email address.

## Plan

### 1. Add navigation links to landing page header

Add "How It Works" and "Partners" links to the Landing page header between the logo and Sign In button. On mobile, these can be compact links or a simple nav bar.

### 2. Create a lead magnet digital product + email capture

Create a free downloadable guide — something like **"The Collector's Card Grading Cheat Sheet"** — a PDF-style resource that provides real value (grading terminology, what PSA/BGS grades mean, photo tips, value ranges by condition). Users enter their email to receive it.

**Implementation:**
- Create a new `LeadMagnet` component embedded on the landing page (between features and pricing sections)
- The component shows a compelling preview of the guide with an email capture form
- On submit, call a new `lead-magnet` edge function that:
  - Validates the email
  - Inserts into the `leads` table with `source: 'lead_magnet'`
  - Sends the digital guide via SendGrid to the captured email
  - Returns success
- The guide content will be an HTML email with the cheat sheet content inline (no PDF hosting needed — the email IS the product)

**Database change:**
- The `leads` table `source` column is an enum (`lead_source`). We need to add `'lead_magnet'` as a new enum value.

### 3. Files to create/modify

| File | Action |
|------|--------|
| `src/pages/Landing.tsx` | Add nav links (Partners, How It Works) to header; add LeadMagnet section |
| `src/components/LeadMagnet.tsx` | New — email capture component with guide preview |
| `supabase/functions/lead-magnet/index.ts` | New — validates email, inserts lead, sends guide email via SendGrid |
| DB migration | Add `'lead_magnet'` to `lead_source` enum |

### Technical Details

- The `lead_source` enum currently has values used by the system. Adding `'lead_magnet'` requires an `ALTER TYPE` migration.
- The edge function reuses the existing `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` secrets.
- The guide email will contain a well-formatted HTML "cheat sheet" covering: grade scale (1-10), condition factors (centering, edges, corners, surface), quick tips, and a CTA back to CollectAI.
- No new secrets or external dependencies needed.

