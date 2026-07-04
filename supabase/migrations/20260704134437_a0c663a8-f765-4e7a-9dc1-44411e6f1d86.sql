
-- 1) Remove overly-broad public read on cards; expose whitelisted columns via a view
DROP POLICY IF EXISTS "Anyone can view cards of public collectors" ON public.cards;

CREATE OR REPLACE VIEW public.cards_public AS
SELECT
  c.id,
  c.user_id,
  c.card_name,
  c.card_set,
  c.card_year,
  c.condition_grade,
  c.estimated_value_low,
  c.estimated_value_high,
  c.rarity,
  c.category,
  c.image_url,
  c.is_public,
  c.created_at
FROM public.cards c
JOIN public.profiles p ON p.id = c.user_id
WHERE c.is_public = true
  AND p.public_collection_enabled = true;

GRANT SELECT ON public.cards_public TO anon, authenticated;

-- 2) Restrict realtime topic subscriptions to user-scoped topics only
DROP POLICY IF EXISTS "Authenticated users can only subscribe to own topics" ON realtime.messages;

CREATE POLICY "Authenticated users can only subscribe to own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() LIKE ('%' || (auth.uid())::text));
