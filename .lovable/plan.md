

## Add Loading Skeletons to Dashboard & Collection

Replace the current loading states with animated skeleton placeholders using the existing `Skeleton` component.

### Changes

| File | What Changes |
|------|-------------|
| `src/pages/Dashboard.tsx` | Add a loading state that shows 3 skeleton stat cards and 3 skeleton card placeholders while data fetches |
| `src/pages/Collection.tsx` | Add a loading state that shows a grid of 6 skeleton card placeholders while the collection loads |

### Dashboard Skeleton Layout
- 3 stat card skeletons (matching the Total Cards / Est. Value / Avg Value layout)
- Each skeleton card: rounded rectangle with a circle (icon placeholder) and two text-line rectangles
- Show while `cards` haven't loaded yet (add a `loading` state boolean)

### Collection Skeleton Layout
- 6 card skeletons in a grid matching the existing card layout
- Each: image placeholder rectangle on top, two text-line skeletons below
- Show while data is being fetched

### Technical Details
- Import `{ Skeleton }` from `@/components/ui/skeleton`
- Add a `loading` boolean state, set `true` initially, set `false` after the Supabase query resolves
- Render skeleton components conditionally when `loading` is true
- Skeletons will use the existing `animate-pulse` animation from the Skeleton component

