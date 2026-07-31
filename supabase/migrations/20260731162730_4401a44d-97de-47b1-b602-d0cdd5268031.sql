ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS beta_access_until timestamptz,
  ADD COLUMN IF NOT EXISTS beta_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_price_locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  beta_cutoff CONSTANT timestamptz := '2026-09-30T23:59:59Z';
  is_beta boolean := now() < beta_cutoff;
BEGIN
  INSERT INTO public.user_credits (user_id, credits, plan, beta_access_until, beta_eligible)
  VALUES (
    NEW.id,
    3,
    'free',
    CASE WHEN is_beta THEN now() + INTERVAL '30 days' ELSE NULL END,
    is_beta
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();

UPDATE public.user_credits
SET beta_eligible = true,
    beta_access_until = COALESCE(beta_access_until, now() + INTERVAL '30 days')
WHERE beta_eligible = false
  AND created_at < '2026-09-30T23:59:59Z';