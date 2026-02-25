
-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;

-- RLS: only admins can read roles
CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Add admin SELECT policies to user_credits and credit_transactions so admin can see all
CREATE POLICY "Admins can view all user credits"
  ON public.user_credits FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all user credits"
  ON public.user_credits FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view all credit transactions"
  ON public.credit_transactions FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Admin can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));
