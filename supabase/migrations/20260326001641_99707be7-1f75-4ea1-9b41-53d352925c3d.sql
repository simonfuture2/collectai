
-- Drop email column from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Update handle_new_user() to stop inserting email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate that we have the required data from the auth.users row
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Invalid user data: user ID is required';
  END IF;

  -- Insert the profile for the new user (email no longer stored in profiles)
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  
  RETURN NEW;
END;
$function$;
