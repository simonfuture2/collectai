
-- Fix: Make the view use SECURITY INVOKER (default, but explicit)
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles 
WITH (security_invoker = true)
AS
SELECT id, display_name, avatar_url, public_collection_slug, public_collection_enabled
FROM public.profiles
WHERE public_collection_enabled = true;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
