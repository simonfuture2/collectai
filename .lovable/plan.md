# Show card photo and name on marketplace listings

## What's wrong
The listing is there (Allen Iverson, active), but the database only lets a card's owner see that card's details and photo. Other shoppers get nothing back, so the page shows "Unknown card" with no picture. The seller sees it fine. The public collection rule doesn't help either, because this card isn't marked public.

## Fix
Let anyone browsing see the **display details** (name, set, rarity, grade, photo) of cards that are on an **active** listing. Nothing else on the card gets shared (notes, AI analysis and values stay private), and when a listing is sold or cancelled the card goes private again.

## Steps
1. Add a database function that returns the display fields for cards on active listings only. The Marketplace page and the listing detail page use it instead of reading the cards table directly.
2. Add a storage rule so the photo of a card on an active listing can be viewed by signed-in shoppers (the photo link is still temporary and signed).
3. Test it as a different account than the seller: the Allen Iverson listing shows its photo and name on both pages, and a non-listed card's photo is still blocked.

## Technical details
- `public.marketplace_listing_cards(_card_ids uuid[])` SECURITY DEFINER, returns id, card_name, card_set, card_year, rarity, condition_grade, image_url, grading_company, grade_numeric — joined to `marketplace_listings` with `status='active'`. Grant execute to authenticated and anon.
- Storage SELECT policy on `storage.objects` for bucket `card-images`: `exists (select 1 from cards c join marketplace_listings l on l.card_id=c.id where c.image_url = objects.name and l.status='active')`.
- Update `src/pages/Marketplace.tsx` and `src/pages/MarketplaceListing.tsx` to call the function via `supabase.rpc`.
