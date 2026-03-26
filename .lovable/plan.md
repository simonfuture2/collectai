

# Fix: Cards RLS policy exposes all cards when public collection is enabled

## Problem
The "Anyone can view cards of public collectors" policy exposes ALL cards (including `is_public = false`) when the owner has `public_collection_enabled = true`. 48 cards with `is_public=false` are currently accessible to anonymous users.

## Solution
Update the policy's USING condition to require BOTH `is_public = true` on the card AND `public_collection_enabled = true` on the profile.

## Change
One database migration:

```sql
DROP POLICY "Anyone can view cards of public collectors" ON public.cards;

CREATE POLICY "Anyone can view cards of public collectors"
  ON public.cards FOR SELECT
  TO public
  USING (
    is_public = true
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = cards.user_id
        AND profiles.public_collection_enabled = true
    )
  );
```

No frontend or edge function changes needed — the PublicCollection page already renders whatever cards the query returns.

