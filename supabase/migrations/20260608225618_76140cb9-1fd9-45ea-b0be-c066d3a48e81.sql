
CREATE TABLE public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.processed_stripe_events TO service_role;

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.processed_stripe_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.add_credits(_user_id UUID, _amount INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance INT;
BEGIN
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'amount must be non-zero';
  END IF;

  INSERT INTO public.user_credits (user_id, credits, plan)
  VALUES (_user_id, GREATEST(0, _amount), 'free')
  ON CONFLICT (user_id) DO UPDATE
    SET credits = GREATEST(0, public.user_credits.credits + _amount),
        updated_at = now()
  RETURNING credits INTO new_balance;

  RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.add_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, INT) TO service_role;
