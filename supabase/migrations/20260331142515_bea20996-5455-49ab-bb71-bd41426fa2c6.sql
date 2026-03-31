-- 1. Fix generated-assets storage policies: restrict to service_role only
DROP POLICY IF EXISTS "Service role can upload generated assets" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update generated assets" ON storage.objects;

CREATE POLICY "Service role can upload generated assets"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'generated-assets');

CREATE POLICY "Service role can update generated assets"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'generated-assets');

-- 2. Lock down user_roles: explicit deny for INSERT/UPDATE/DELETE
CREATE POLICY "Deny insert on user_roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny update on user_roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Deny delete on user_roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (false);

-- 3. Explicit deny UPDATE on card_folders
CREATE POLICY "Deny all updates to card_folders"
  ON public.card_folders FOR UPDATE
  USING (false);