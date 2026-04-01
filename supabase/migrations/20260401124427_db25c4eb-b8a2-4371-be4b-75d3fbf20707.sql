-- 1. Fix cards UPDATE policy: add WITH CHECK to prevent ownership reassignment
DROP POLICY IF EXISTS "Users can update their own cards" ON public.cards;
CREATE POLICY "Users can update their own cards"
  ON public.cards FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Replace PERMISSIVE deny policies on user_roles with RESTRICTIVE policies
DROP POLICY IF EXISTS "Deny insert on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Deny update on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Deny delete on user_roles" ON public.user_roles;

CREATE POLICY "Restrict insert on user_roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Restrict update on user_roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Restrict delete on user_roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (false);

-- 3. Add UPDATE policy on card-images storage bucket
CREATE POLICY "Users can update their own card images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'card-images' AND (auth.uid())::text = (storage.foldername(name))[1]);