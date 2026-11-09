CREATE OR REPLACE FUNCTION public.marketplace_listing_cards(_card_ids uuid[])
RETURNS TABLE(id uuid, card_name text, card_set text, card_year text, rarity text, condition_grade text, image_url text, grading_company text, grade_numeric numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.id, c.card_name, c.card_set, c.card_year, c.rarity, c.condition_grade, c.image_url, c.grading_company, c.grade_numeric
  FROM public.cards c JOIN public.marketplace_listings l ON l.card_id = c.id
  WHERE l.status = 'active' AND c.id = ANY(_card_ids);
$$;
GRANT EXECUTE ON FUNCTION public.marketplace_listing_cards(uuid[]) TO anon, authenticated;
CREATE POLICY "Listed card images are viewable" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'card-images' AND EXISTS (SELECT 1 FROM public.cards c JOIN public.marketplace_listings l ON l.card_id = c.id WHERE c.image_url = objects.name AND l.status = 'active'));