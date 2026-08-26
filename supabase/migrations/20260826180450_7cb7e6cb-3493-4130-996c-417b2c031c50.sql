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
    CASE WHEN is_beta THEN now() + INTERVAL '90 days' ELSE NULL END,
    is_beta
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

UPDATE public.user_credits
SET beta_access_until = now() + INTERVAL '90 days',
    beta_eligible = true,
    updated_at = now()
WHERE beta_eligible = true
  AND (beta_access_until IS NULL OR beta_access_until < now() + INTERVAL '90 days');