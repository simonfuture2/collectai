
-- Fix 1: Replace overly broad public profiles policy that exposes email
DROP POLICY IF EXISTS "Anyone can view public profiles" ON profiles;

-- New policy still allows viewing public profiles but RLS alone can't restrict columns.
-- The existing public_profiles VIEW already excludes email/referral_code, so we keep
-- a policy that only matches public profiles. Frontend must use the view or select safe columns.
CREATE POLICY "Public can view public profiles" ON profiles
  FOR SELECT TO anon, authenticated
  USING (public_collection_enabled = true);

-- Fix 2: Remove dangerous INSERT policy on user_credits (payment bypass)
DROP POLICY IF EXISTS "Users can insert their own credits" ON user_credits;
