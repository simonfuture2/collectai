-- Make the card-images bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'card-images';

-- Drop the overly permissive "Anyone can view" policy
DROP POLICY IF EXISTS "Anyone can view card images" ON storage.objects;