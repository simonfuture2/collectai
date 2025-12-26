-- Drop and recreate the handle_new_user function with improved validation
-- SECURITY DEFINER is required here because this function runs as a trigger
-- after a user is created in auth.users, and needs elevated privileges to insert
-- into the profiles table before RLS policies can authenticate the new user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Validate that we have the required data from the auth.users row
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Invalid user data: user ID is required';
  END IF;
  
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'Invalid user data: email is required';
  END IF;

  -- Insert the profile for the new user
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  
  RETURN NEW;
END;
$$;

-- Add comment explaining why SECURITY DEFINER is required
COMMENT ON FUNCTION public.handle_new_user() IS 
'Trigger function to create a profile when a new user signs up.
SECURITY DEFINER is required because this runs during user creation 
before the user can be authenticated. The function is minimal and only 
performs a single INSERT with validated data from auth.users.
DO NOT add dynamic SQL or user-controlled input to this function.';