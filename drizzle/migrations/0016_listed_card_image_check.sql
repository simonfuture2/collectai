CREATE OR REPLACE FUNCTION public.is_listed_card_image(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cards c JOIN public.marketplace_listings l ON l.card_id = c.id
                 WHERE c.image_url = _name AND l.status = 'active');
$$;
GRANT EXECUTE ON FUNCTION public.is_listed_card_image(text) TO anon, authenticated;
DROP POLICY IF EXISTS "Listed card images are viewable" ON storage.objects;
CREATE POLICY "Listed card images are viewable" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'card-images' AND public.is_listed_card_image(name));