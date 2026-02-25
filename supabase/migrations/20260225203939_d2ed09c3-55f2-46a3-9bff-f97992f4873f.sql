
-- Feature 1: Referral System
-- Add referral_code to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Create referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE,
  referral_code text NOT NULL,
  credited boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can view their own referrals (as referrer)
CREATE POLICY "Users can view referrals they made" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id);

-- Trigger to auto-generate referral code on profile insert
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(md5(random()::text || NEW.id::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_generate_referral
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_referral_code();

-- Also generate codes for existing profiles that don't have one
UPDATE public.profiles SET referral_code = upper(substr(md5(random()::text || id::text), 1, 8)) WHERE referral_code IS NULL;

-- Feature 2: Shareable Certificates
-- Add is_public to cards
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Allow anonymous read of public cards
CREATE POLICY "Anyone can view public cards" ON public.cards
  FOR SELECT USING (is_public = true);

-- Feature 4: Public Collections
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_collection_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_collection_slug text UNIQUE;

-- Allow anonymous read of public profiles
CREATE POLICY "Anyone can view public profiles" ON public.profiles
  FOR SELECT USING (public_collection_enabled = true);

-- Allow anonymous read of cards for users with public collections
CREATE POLICY "Anyone can view cards of public collectors" ON public.cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = cards.user_id
      AND profiles.public_collection_enabled = true
    )
  );
