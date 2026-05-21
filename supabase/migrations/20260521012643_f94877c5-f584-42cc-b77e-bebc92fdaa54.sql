CREATE POLICY "Service role can delete generated assets"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'generated-assets');