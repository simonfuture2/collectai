

## Collection Page Improvement Opportunities

After reviewing the current implementation, here are the areas that could be improved, grouped by priority:

### 1. Pagination / Infinite Scroll
The page loads all cards at once. For users with large collections (100+), this causes slow load times and excessive memory use. Adding pagination (e.g., 20 cards per page with load-more or page controls) would solve this.

### 2. Grid/List View Toggle
Currently only a grid view is available. Adding a toggle to switch between grid (visual) and list/table (data-dense) view would help users who want to quickly scan names, values, and grades without thumbnails.

### 3. Bulk Actions
No way to select multiple cards for bulk delete, bulk export, or bulk category reassignment. Adding checkboxes with a floating action bar ("Delete selected", "Export CSV") would be useful for power users.

### 4. Image Loading States
Card images have no placeholder or error fallback. If a signed URL expires or the image fails to load, the user sees a broken image. Adding an `onError` fallback and a blur-up placeholder would improve perceived performance.

### 5. Mobile Delete UX
The delete button uses `opacity-0 group-hover:opacity-100`, which is invisible on touch devices since there's no hover state. Mobile users currently have no visible way to delete a card from this page. Should show the delete icon on mobile always, or use a swipe-to-delete or long-press pattern.

### 6. Collection Stats Summary Bar
Add a small summary strip below the header showing: total cards, total estimated value, average grade, and top category. This gives users a quick portfolio snapshot.

### 7. Empty Search Suggestions
When a search returns no results, the page only says "No items match." It could suggest related terms or show the closest matches.

### 8. Card Grade Badge on Thumbnails
The condition grade isn't visible on the collection grid. Adding a small grade badge (e.g., "PSA 9") in the corner of each card image would add useful information without requiring users to click into each card.

---

### Recommended Implementation Plan

| Priority | Change | Details |
|----------|--------|---------|
| High | Fix mobile delete visibility | Show delete icon on mobile (always visible or via long-press) |
| High | Add image error fallback | `onError` handler to show placeholder image |
| Medium | Add grade badge to card thumbnails | Small badge in bottom-right corner of card image |
| Medium | Add collection stats summary | Row of stat pills below header |
| Medium | Add grid/list view toggle | Toggle button in the sort/filter bar |
| Low | Add pagination or infinite scroll | Load 20 cards at a time with "Load More" button |
| Low | Bulk select and actions | Checkbox mode with floating action bar |

### Technical Details

- **Mobile delete fix**: Replace `opacity-0 group-hover:opacity-100` with `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` so the icon is always visible on small screens.
- **Image fallback**: Add `onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}` to the `<img>` tag.
- **Grade badge**: Conditionally render `card.condition_grade` as a small positioned badge inside the image container.
- **Stats summary**: Compute total cards, avg value, avg grade from the `filtered` array and render as a horizontal row of pills.
- **Grid/list toggle**: Add a state `viewMode: 'grid' | 'list'` and conditionally render either the current grid or a `Table` component with columns for name, set, year, grade, value.

