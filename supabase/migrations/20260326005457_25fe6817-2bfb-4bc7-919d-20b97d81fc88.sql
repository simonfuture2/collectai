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