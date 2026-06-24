## Grading Guides Section

Add a new marketing/content section under `/grading/*` that explains card grading companies. Uses existing stack, design tokens, `GlassCard`, and `Landing` header patterns.

### Routes
- `/grading` — hub index
- `/grading/tag` — live TAG guide
- `/grading/psa`, `/grading/bgs`, `/grading/cgc`, `/grading/sgc` — stub pages

### Data model
Create `src/lib/gradingGuides.ts` with:
```ts
interface GradingGuide {
  slug: string;
  name: string;
  blurb: string;
  status: 'live' | 'coming_soon';
  partnerBadge: boolean;
}
```
Five entries: TAG (live), PSA/BGS/CGC/SGC (coming_soon), all `partnerBadge: false`.

### Pages
1. **Hub (`src/pages/GradingGuides.tsx`)**
   - Marketing-style header with back button + theme toggle.
   - Heading "Grading Guides".
   - Editable intro paragraph (placeholder copy).
   - Responsive grid of `GlassCard` entries, one per company.
   - Card content: company name, blurb, status badge, optional "MyCollectAi × {name}" partner badge.
   - Live cards link to their guide; coming-soon cards link to stub and show "Guide coming soon".

2. **Guide (`src/pages/GradingGuide.tsx`)**
   - Reads `:slug` from URL, looks up in data.
   - Live TAG guide: clean article layout with sections (overview, scale, what they grade, submission tips, why TAG).
   - Coming-soon stubs: friendly placeholder with link back to hub.

### Navigation
- In `src/pages/Landing.tsx`, replace the inline "How It Works" link with a **Resources** dropdown containing:
  - Grading Guides → `/grading`
  - How It Works → `/how-it-works`
- Mirror the same links in the mobile sheet menu.
- Add a "Learn" column in `Footer.tsx` with Grading Guides + How It Works links.

### Routing
- Register all six routes in `src/App.tsx` with `React.lazy()` + `Suspense`.

### No changes to
Scan flow, pricing, Supabase, Stripe, or business logic.