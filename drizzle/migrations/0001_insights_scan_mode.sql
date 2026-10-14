ALTER TABLE public.cards
  ADD COLUMN scan_purpose text NOT NULL DEFAULT 'collection',
  ADD COLUMN asking_price numeric(12,2),
  ADD COLUMN insight_event text,
  ADD COLUMN moved_to_collection_at timestamptz;
ALTER TABLE public.cards ADD CONSTRAINT cards_scan_purpose_chk
  CHECK (scan_purpose IN ('collection','insight'));
ALTER TABLE public.cards ADD CONSTRAINT cards_insight_private_chk
  CHECK (scan_purpose = 'collection' OR (is_public = false AND is_listed = false));
CREATE INDEX IF NOT EXISTS cards_user_purpose_created_idx
  ON public.cards (user_id, scan_purpose, created_at DESC);

DROP POLICY IF EXISTS "Anyone can view cards of public collectors" ON public.cards;
CREATE POLICY "Anyone can view cards of public collectors" ON public.cards
  FOR SELECT USING (
    is_public = true AND scan_purpose = 'collection' AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = cards.user_id AND profiles.public_collection_enabled = true));

DROP POLICY IF EXISTS "Sellers create listings" ON public.marketplace_listings;
CREATE POLICY "Sellers create listings" ON public.marketplace_listings
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = seller_id AND EXISTS (
      SELECT 1 FROM public.cards c
      WHERE c.id = marketplace_listings.card_id AND c.user_id = auth.uid() AND c.scan_purpose = 'collection'));