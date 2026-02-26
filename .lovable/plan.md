

# Landing Page Upgrades: Action-First Hero + Certificate Verification Tool

## 1. Redesign Hero Section — "Scan in 3 Seconds" Focus

Restructure the hero in `Landing.tsx` to lead with action:

- **Move the CTA up top**: Large "Scan Your Card Now" button as the first visual element after the headline, removing the sub-pill badge and trimming copy
- **Add an animated scan demo**: Create a new `ScanDemo` component — a looping CSS animation showing a card photo being "processed" with a grade + value appearing (no video needed, pure CSS/SVG mock). This replaces the static `comboGraphic` image in the hero area
- **Tighten the headline**: Shorten to something like "Scan. Grade. Value." with the gradient text, then immediately the CTA button
- **Move social proof stats directly under the CTA** for immediate credibility

## 2. Add "Verify a Certificate" Tool on Homepage

- **Embed a compact version of `AuthentiSealVerify`** (verification-only, no "Create Certificate" section) directly on the landing page as a new section between features and pricing
- **Section title**: "Verify Any Certificate" with a brief one-liner about on-chain verification
- **Reuse the existing component** by passing no `cardData`/`cardId` props — the create section only shows when those are provided, so we'll add a `showCreate={false}` prop or simply render just the verify portion
- **Add a `verifyOnly` prop** to `AuthentiSealVerify` to hide the create certificate section when embedded on the landing page

## 3. Create `ScanDemo` Component

New file: `src/components/ScanDemo.tsx`

- Animated card mockup: shows a card silhouette → scanning animation (gradient sweep) → grade badge + value appearing
- Pure CSS animations, no external assets required
- Responsive, works on mobile

## Files Changed

| File | Change |
|------|--------|
| `src/components/ScanDemo.tsx` | New — animated scan demo component |
| `src/components/AuthentiSealVerify.tsx` | Add `verifyOnly` prop to hide create section |
| `src/pages/Landing.tsx` | Restructure hero (CTA-first, scan demo, embedded verify tool) |

