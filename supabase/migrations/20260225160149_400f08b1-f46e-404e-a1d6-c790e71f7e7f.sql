-- Create a public storage bucket for generated assets (logos, hero images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-assets', 'generated-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Generated assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-assets');

-- Allow service role to upload generated assets
CREATE POLICY "Service role can upload generated assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generated-assets');

CREATE POLICY "Service role can update generated assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'generated-assets');