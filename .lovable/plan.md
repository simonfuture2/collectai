# Rebrand: CollectAI → MyCollectAI

A scan found ~150 occurrences of "CollectAI" across ~40 files. I'll split them into **rename** (user-facing copy) and **leave alone** (technical identifiers that would break things).

## What I'll rename (user-visible)

All display strings, headings, body copy, meta tags, alt text, JSON-LD `name`, manifest `name`/`short_name`, push notification copy, email/drip campaign templates, and legal page titles in:

- `index.html` — JSON-LD `Organization.name`, og descriptions
- `public/manifest.webmanifest` and `public/llms.txt`
- All pages under `src/pages/*.tsx` (About, FAQ, Landing, Pricing, Terms, Privacy, etc.)
- All components under `src/components/*.tsx` (Footer, LeadMagnet, EcosystemBadge label, ReferralCard, ConnectedAccounts, etc.)
- `src/hooks/use-push-notifications.ts` — notification titles
- Edge function user-facing strings: `drip-campaign`, `lead-magnet`, `generate-assets`
- `capacitor.config.ts` — `appName` display string (NOT `appId`)

Rule: literal word "CollectAI" preceded by a space, quote, `>`, or start-of-string → "MyCollectAI". Compound brand phrases like "MyCollectAI" (already correct) and "AuthentiSeal" stay untouched.

## What I'll leave alone (technical — renaming breaks the app)

- **Edge function slugs**: `supabase/functions/collectai-grade/`, `collectai-identify/`, `collectai-price/` — folder names are the deployed function URLs. Renaming breaks every client call.
- **Component filename** `src/components/CollectAILink.tsx` and its imports — internal identifier only, no user impact.
- **External ecosystem URL** `https://collectai.lovable.app` (used in `EcosystemBadge`, `CollectAILink`, `index.html` `sameAs`, About page) — that's the live published URL of the sister/legacy site. The primary canonical domain `https://mycollectai.com` is already in place.
- **CSS color tokens** like `collectai-purple`, `collectai-blue` in `PoweredByW3AI` — internal token names.
- `tsconfig.app.tsbuildinfo` — generated build artifact.

## Verification

After edits I'll re-grep to confirm only the allow-listed technical references remain, then spot-check the Landing, Footer, About, manifest, and JSON-LD.

## Open question

The published URL `collectai.lovable.app` and the `CollectAI` label inside `EcosystemBadge` currently present CollectAI as a *separate* product in the W3MCT ecosystem (alongside AuthentiSeal). If those references should also be flipped to MyCollectAI (treating them as the same product), tell me and I'll include them — otherwise I'll leave the ecosystem cross-links as-is.
