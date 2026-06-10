
## Mobile-only layout improvements

Scope: All changes are mobile-only (`< sm` / `< md` breakpoints). Desktop layout is untouched.

### 1. Dashboard header — "Pro Plan" badge covering "MyCollectAI"
File: `src/pages/Dashboard.tsx` + `src/components/CreditBalance.tsx`

The header crams logo + wordmark + Pro badge + admin + email + theme + logout into one row, which overflows on a 390px screen and pushes the Pro badge over the wordmark.

- On mobile: hide the "MyCollectAI" wordmark text (keep the logo icon), and render `CreditBalance` in `compact` mode (just "Pro" / number, no "Pro Plan"/"credits" label).
- Wrap header right-side controls with `flex-wrap` + tighter `gap-2` so nothing overlaps.
- Hide the user email (already hidden < sm — keep).
- Keep desktop unchanged via `sm:` / `md:` prefixes.

### 2. "Screen feels too zoomed in" on mobile
File: `index.html`

Current viewport meta (if present) likely lacks `viewport-fit`/proper scale. Verify `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` is set. No `maximum-scale`.

Also reduce mobile horizontal padding on Dashboard main container from `px-4` → `px-3` and shrink the H1 ("Your Collection") + stat cards on mobile:
- Stat cards: `p-6` → `p-4 sm:p-6`, icon `w-10 h-10` → `w-8 h-8 sm:w-10 sm:h-10`, value text `text-2xl` → `text-xl sm:text-2xl`.
- "View Analytics" button on mobile: icon-only or shorter label so the header row doesn't wrap awkwardly.

### 3. Achievements row layout
File: `src/components/AchievementsRow.tsx`

Current grid is `grid-cols-5 sm:grid-cols-6 md:grid-cols-10`. 5 columns on a 390px screen squeezes each badge to ~60px, and the label line-clamps to a single cramped line.

Mobile redesign:
- Switch mobile to a horizontal scroll snap row: `flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3` with each tile `min-w-[88px] snap-start`.
- Desktop (`sm:` and up) keeps the existing grid (`sm:grid sm:grid-cols-6 md:grid-cols-10 sm:gap-3 sm:overflow-visible sm:mx-0 sm:px-0`).
- Increase tile padding on mobile so icons breathe; allow up to 2 lines of label text on mobile (`line-clamp-2`).
- Header counter "X/Y unlocked" stays.

### 4. Collection filters — convert to dropdown on mobile
File: `src/pages/Collection.tsx`

Currently when the user taps "Filters" the page expands three rows of wrap-flow chips (Category / Rarity / Grade). On mobile this becomes a tall scrolling wall.

Mobile redesign:
- On mobile (`< sm`), replace the chip groups with three `Select` (shadcn) dropdowns side-by-side or stacked: Category, Rarity, Grade. Each shows the active value and an "All" option to clear.
- Sort control: keep, but swap the native `<select>` for the shadcn `Select` for consistent styling on mobile.
- Wrap the top toolbar (Filters / Select / view-toggle / Sort) so it doesn't overflow: change `flex items-center gap-2` to `flex flex-wrap items-center gap-2`, put the view-toggle + sort on a second line on mobile.
- Desktop (`sm:` and up) keeps the existing chip UI via `hidden sm:block` / `sm:hidden` swaps.

### 5. Other mobile-only improvements (recommended)
- **Collection header**: the right-side "items / total value" stack often collides with ThemeToggle on 390px. Shrink the items label to `text-xs`, value to `text-base`, and reduce gap.
- **Dashboard action buttons row** ("Scan New Card", "Pack Rip Mode", "View Full Collection", "Marketplace"): on mobile, make these full-width stacked (`w-full sm:w-auto`) inside a `flex-col sm:flex-row` wrapper so taps are easy and nothing wraps mid-label.
- **Stats summary chips on Collection**: already wrap, but reduce `text-xs` chip padding on mobile (`px-2 py-1`) so 5 chips fit two rows max.
- **Sticky header on Collection**: shrink vertical padding from `py-4` → `py-2 sm:py-4` so the search bar isn't pushed below the fold.
- **Bottom safe-area**: add `pb-[env(safe-area-inset-bottom)]` to the footer wrapper so iPhone home-bar doesn't overlap the last button.

### Files touched
- `src/pages/Dashboard.tsx`
- `src/components/CreditBalance.tsx`
- `src/components/AchievementsRow.tsx`
- `src/pages/Collection.tsx`
- `index.html` (viewport meta verify only)

No business logic, data, or desktop styles change.
