

# How-To Guide Page

## Overview

Create a new "How It Works" page (`/how-it-works`) that walks users through the core CollectAI workflow with step-by-step instructions and support graphics (icons + illustrated cards). This page serves double duty: onboarding new users and impressing Google Play reviewers.

## Page Structure

The page will have 5 sections, each with an icon, step number, title, description, and a visual mock/illustration card:

```text
┌─────────────────────────────────────┐
│  Header (back arrow + title)        │
├─────────────────────────────────────┤
│  Hero: "How CollectAI Works"        │
│  Subtitle text                      │
├─────────────────────────────────────┤
│  Step 1: Sign Up & Get Free Scans   │
│  [Icon + description + visual]      │
│                                     │
│  Step 2: Upload or Snap Your Card   │
│  [Camera icon + upload UI mock]     │
│                                     │
│  Step 3: AI Analyzes Your Card      │
│  [Brain icon + analysis breakdown]  │
│                                     │
│  Step 4: Review Results & Save      │
│  [Results card mock + save action]  │
│                                     │
│  Step 5: Seal with AuthentiSeal     │
│  [Blockchain icon + certificate]    │
├─────────────────────────────────────┤
│  Pro Tips (3 cards grid)            │
├─────────────────────────────────────┤
│  CTA: "Ready to start?" button      │
├─────────────────────────────────────┤
│  Footer                             │
└─────────────────────────────────────┘
```

## Changes Required

### 1. Create `src/pages/HowItWorks.tsx`
- Uses `LegalPageLayout` for consistent header/footer structure (title: "How It Works")
- 5 numbered step sections, each with:
  - Lucide icon in a colored badge
  - Step number indicator (1–5)
  - Title and description paragraph
  - A visual "mock" card (styled div showing a simplified representation of the UI at that step — e.g., a card upload area, an analysis result card, a certificate badge)
- "Pro Tips" section with 3 tip cards (use multiple angles, good lighting, flat surface)
- Bottom CTA button linking to `/scan` (or `/auth` for unauthenticated users)

### 2. Update `src/App.tsx`
- Import and add route: `<Route path="/how-it-works" element={<HowItWorks />} />`

### 3. Update `src/components/Footer.tsx`
- Add "How It Works" link under the "Product" column

### Visual Support Graphics
Since we can't add actual image files, each step will include a styled illustration card built with Tailwind — colored backgrounds, icons, and mock UI elements that visually represent each step (upload area, scan animation, results card, certificate badge). These serve as the "support graphics" and look polished without external assets.

## Technical Details
- No new dependencies needed — uses existing Lucide icons, Card components, and Tailwind classes
- No database changes
- Files: `src/pages/HowItWorks.tsx` (new), `src/App.tsx` (add route), `src/components/Footer.tsx` (add link)

