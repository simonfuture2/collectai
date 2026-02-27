DROP POLICY "Public can view demo card images" ON storage.objects;
CREATE POLICY "Public can view demo card images"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images' AND (name LIKE 'demo/%' OR name = '4ed2a0f8-5913-4257-9433-d4338eb821bb/1766709209222-fleermetal_95-96_jordan.jpeg'));