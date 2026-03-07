
-- 1. Create public_profiles view (hides email)
CREATE VIEW public.public_profiles AS
SELECT id, display_name, avatar_url, public_collection_slug, public_collection_enabled
FROM public.profiles
WHERE public_collection_enabled = true;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2. Atomic credit deduction function
CREATE OR REPLACE FUNCTION public.deduct_credit(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  remaining integer;
BEGIN
  UPDATE user_credits
  SET credits = credits - 1, updated_at = now()
  WHERE user_id = _user_id AND credits > 0
  RETURNING credits INTO remaining;
  
  IF remaining IS NULL THEN
    RETURN -1; -- indicates no credits available
  END IF;
  
  RETURN remaining;
END;
$$;

-- 3. Users can read their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
