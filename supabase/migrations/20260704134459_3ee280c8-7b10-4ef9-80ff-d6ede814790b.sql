
-- Remove the helper view; we'll rely on column-level privileges instead
DROP VIEW IF EXISTS public.cards_public;

-- Re-add the public-collection row policy (was dropped in prior migration)
CREATE POLICY "Anyone can view cards of public collectors"
ON public.cards
FOR SELECT
USING (
  is_public = true
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = cards.user_id
      AND profiles.public_collection_enabled = true
  )
);

-- Column-level privileges: anon can only read whitelisted display columns
REVOKE SELECT ON public.cards FROM anon;
GRANT SELECT (
  id,
  user_id,
  card_name,
  card_set,
  card_year,
  condition_grade,
  estimated_value_low,
  estimated_value_high,
  rarity,
  category,
  image_url,
  is_public,
  created_at
) ON public.cards TO anon;
