# Show card photos on marketplace listings

## What's wrong
The last fix added a rule that lets shoppers open the photo of any card in an active listing. But that rule checks the cards list *as the shopper*, and shoppers can't see other people's cards, so the check always fails and the photo request is refused. Name and set now show (they use a different path); the photo doesn't.

## Fix
1. Add a small protected database check, `is_listed_card_image(path)`, that looks up "is this photo attached to a card in an active listing?" with full access, returning only yes/no.
2. Replace the photo-viewing rule for card photos to use that check. Owners keep their existing access; photos of unlisted, sold or cancelled cards stay private.
3. No screen changes needed — both marketplace pages already ask for the photo correctly.

## Check
Sign in as an account that isn't the seller, open the marketplace and the Allen Iverson listing, and confirm the photo loads on both the grid and the listing page.

## Technical details
- Migration: `CREATE FUNCTION public.is_listed_card_image(_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public` selecting EXISTS over cards JOIN marketplace_listings (status 'active', c.image_url = _name); grant execute to anon, authenticated.
- `DROP POLICY "Listed card images are viewable" ON storage.objects;` then recreate it `FOR SELECT TO anon, authenticated USING (bucket_id='card-images' AND public.is_listed_card_image(name))`.
