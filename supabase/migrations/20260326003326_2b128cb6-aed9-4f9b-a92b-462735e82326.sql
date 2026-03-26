
-- 1. Create referral_codes table
CREATE TABLE public.referral_codes (
  user_id uuid NOT NULL PRIMARY KEY,
  code text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- 3. Owner-only SELECT policy
CREATE POLICY "Users can view their own referral code"
  ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Migrate existing codes
INSERT INTO public.referral_codes (user_id, code, created_at)
SELECT id, referral_code, now()
FROM public.profiles
WHERE referral_code IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. Create trigger to auto-generate code on insert
CREATE OR REPLACE FUNCTION public.generate_referral_code()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := upper(substr(md5(random()::text || NEW.user_id::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER generate_referral_code_trigger
  BEFORE INSERT ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_referral_code();

-- 6. Drop old trigger on profiles (if exists)
DROP TRIGGER IF EXISTS generate_referral_code ON public.profiles;

-- 7. Update handle_new_user to also insert into referral_codes
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Invalid user data: user ID is required';
  END IF;

  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  INSERT INTO public.referral_codes (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 8. Drop referral_code column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS referral_code;
