

# "Grade My Card" Challenge — Free Quick Scan on Landing Page

## Overview

Add a gamified lead-gen section to the landing page where **unauthenticated visitors** can upload a card photo and get a free "Quick Scan" — a simplified result showing card name, estimated grade, and value range. The full detailed analysis is gated behind sign-up.

## Architecture

```text
Landing Page
  └─ QuickScanChallenge component
       ├─ Upload zone (single image, no auth required)
       ├─ Calls new "quick-scan" edge function (no JWT)
       ├─ Shows teaser result (name, grade, value range)
       ├─ Blurs/locks detailed breakdown
       └─ CTA: "Sign up to unlock full analysis"
```

## 1. New Edge Function: `supabase/functions/quick-scan/index.ts`

- **No JWT required** — open to anonymous visitors
- **Rate-limited by IP** (simple in-memory map, e.g. 3 scans per IP per hour)
- Accepts a base64-encoded image (no storage upload needed for anonymous users)
- Calls Lovable AI with a **simplified prompt** — returns only: card name, set, year, condition grade, estimated value range, and confidence
- Returns a compact JSON response (no pre-grading analysis, no market breakdown)
- Register in `supabase/config.toml` with `verify_jwt = false`

## 2. New Component: `src/components/QuickScanChallenge.tsx`

- Upload zone with drag-and-drop or click to select (single image only)
- Animated scanning state (reuse scan-sweep animation from ScanDemo)
- Result card showing:
  - Card name, set, year
  - AI grade badge (e.g. "NM 7")
  - Value range (e.g. "$80 – $200")
- Blurred/locked sections with overlay text: "Pre-Grading Analysis", "Market Data", "Graded Value Estimates" — each with a lock icon
- Bottom CTA: **"Sign Up Free to Unlock Full Report"** → links to `/auth`
- Reset button to scan another card

## 3. Landing Page Update: `src/pages/Landing.tsx`

- Add the QuickScanChallenge section between the Hero and the Features grid
- Section heading: **"Think Your Card Is Worth Something?"** with subtext: *"Upload a photo and find out in seconds — no account needed"*

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/quick-scan/index.ts` | New — lightweight anonymous scan endpoint |
| `supabase/config.toml` | Register quick-scan function |
| `src/components/QuickScanChallenge.tsx` | New — upload + teaser result component |
| `src/pages/Landing.tsx` | Add QuickScanChallenge section |

