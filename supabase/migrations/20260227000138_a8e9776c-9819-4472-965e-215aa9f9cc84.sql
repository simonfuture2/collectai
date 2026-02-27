CREATE POLICY "Public can view demo card images"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images' AND name LIKE 'demo/%');