
Root cause identified:
- The new prominent button and “Estimated Value” card in `src/pages/CardDetail.tsx` use `bg-gradient-primary`.
- `bg-gradient-primary` is not a real utility/class in this project; the defined custom class is `gradient-primary` (from `src/index.css`).
- Because `Button` uses class merging, this invalid `bg-*` class overrides the valid default button background, making the button appear white/transparent until hover styles kick in.
- Same issue causes white “Est. Value” text to sit on a light background in Light theme.

Implementation plan:

1) Fix Card Detail gradient classes
- File: `src/pages/CardDetail.tsx`
- Replace:
  - `bg-gradient-primary` on the Estimated Value stat card → `gradient-primary`
  - `className="w-full bg-gradient-primary ..."` on Re-Scan button → `className="w-full gradient-primary ..."`
- Keep explicit white text classes (`text-white`, `text-white/80`, `text-white/70`) so contrast stays strong on both themes.

2) Prevent the same bug on shared card page
- File: `src/pages/SharedCard.tsx`
- Replace `bg-gradient-primary` on its Estimated Value card with `gradient-primary` for consistency and to avoid similar visibility issues there too.

3) Quick visual verification checklist (after changes)
- On `/card/:id` in Light theme:
  - Re-Scan button is visible without hover.
  - Estimated Value panel has visible gradient background and readable white text.
- On Dark theme:
  - Contrast remains good.
- On shared card page:
  - Estimated Value panel renders with the intended gradient and readable text.

Technical notes:
- No backend/database/auth changes required.
- This is a styling/class fix only; no behavior changes to re-scan logic.
