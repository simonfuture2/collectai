-- 1. Admin update policy: add WITH CHECK so admins cannot reassign a credits row to another user
DROP POLICY IF EXISTS "Admins can update all user credits" ON public.user_credits;
CREATE POLICY "Admins can update all user credits"
ON public.user_credits
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 2. Column-level guard: only admins or server-side (service role / no JWT) may mutate beta fields
CREATE OR REPLACE FUNCTION public.guard_beta_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF NEW.beta_access_until IS DISTINCT FROM OLD.beta_access_until
     OR NEW.beta_eligible IS DISTINCT FROM OLD.beta_eligible
     OR NEW.beta_price_locked_at IS DISTINCT FROM OLD.beta_price_locked_at THEN
    -- server-side contexts: no end-user JWT, or explicit service_role
    IF uid IS NULL OR jwt_role = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT public.is_admin(uid) THEN
      RAISE EXCEPTION 'Only admins may modify beta program fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_beta_fields_trg ON public.user_credits;
CREATE TRIGGER guard_beta_fields_trg
BEFORE UPDATE ON public.user_credits
FOR EACH ROW EXECUTE FUNCTION public.guard_beta_fields();