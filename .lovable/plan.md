# Insights scan mode (database and backend only)

An insight scan creates the same card record as a normal scan, marked with a purpose of "insight". The scan pipeline, pricing, pre-grade, slab reading and the reveal screen keep working unchanged. No new screens are built in this step.

## 1. Migration
- Add 4 columns to cards:
  - `scan_purpose text NOT NULL DEFAULT 'collection'`
  - `asking_price numeric(12,2)`
  - `insight_event text`
  - `moved_to_collection_at timestamptz`
- Add check constraints:
  - `cards_scan_purpose_chk`: purpose must be `collection` or `insight`.
  - `cards_insight_private_chk`: an insight card can never be public or listed.
- Add index `cards_user_purpose_created_idx (user_id, scan_purpose, created_at DESC)`.
- Existing rows get `'collection'` from the default.
- Lock down public access at the database level:
  - The policy "Anyone can view cards of public collectors" is recreated with `AND scan_purpose = 'collection'`.
  - The marketplace "Sellers create listings" check also requires the card to be a collection card.
  - The other cards policies only let owners see their own cards, so they stay as they are.
  - There are no views or SQL functions that total cards.

## 2. identify-card
- Accept `scanPurpose` (`collection` | `insight`, default `collection`); any other value returns 400.
- Accept optional `askingPrice` (a number, 0 or more) and `insightEvent` (trimmed, max 80 characters). Invalid values return 400. Both are stored only when the scan is an insight scan.
- Write all three onto the placeholder card. Credits and rate limits stay as they are.
- Return `{ cardId, scanPurpose }`, alongside the fields the app already reads.

## 3. Keep insight cards out of "my collection"
Add `.eq("scan_purpose", "collection")` to the collection queries in:
- Pages: Dashboard, Collection, Achievements, Showcase, PublicCollection, Marketplace
- Components: ConnectedAccounts, AuthenticatedProfile, CardPairing; also PortfolioAnalytics and PortfolioHero if they query cards
- MCP tools: list-cards, collection-summary
- Backend: suggest-card-pair, pair-cards (only collection cards are paired) and the card counts in admin-data
- In CreateListing, block insight cards with the message: "Add this card to your collection before listing it."

These will be left unfiltered on purpose, and the final report will confirm each one with its reason:
- They work on one specific card by its id: CardDetail, ScanReveal, Scan, get-card, update-card-notes, and the backend functions that look a card up by id (analyze-card, enrich-card, reanalyze-card, scan-slab, collectai-price, authentiseal webhook and token, id-bakeoff).
- delete-account must remove every card.
- SharedCard and MarketplaceListing are already protected by the public and listing rules above.

## 4. `src/lib/insights.ts`
- `moveInsightToCollection(cardId)` sets `scan_purpose = 'collection'`, `moved_to_collection_at = now()` and `asking_price = null`. The owner's existing permission to update their own cards already allows this.
- `dealVerdict(askingPrice, low, high)` compares the asking price with the market range:
  - Below the range: "Below market" (good). Above it: "Above market" (bad). Inside it: "Fair price" (neutral).
  - Each result includes `diffPct`, the percent difference from the range midpoint, rounded.
  - It returns null when a value is missing or the midpoint is 0 or less.

## 5. Types and verification
- Types are regenerated automatically by the migration.
- Deploy identify-card, pair-cards, suggest-card-pair and admin-data.
- Call identify-card with a bad `scanPurpose` and confirm it returns 400.
- Check the database rule: try to make an insight card public and confirm it is refused.
- Search for `.from("cards")` again and report every hit, with what changed or why it was left unfiltered.
