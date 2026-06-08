
CREATE TABLE public.daily_budget_counters (
  bucket_key TEXT NOT NULL,
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, day)
);

GRANT ALL ON public.daily_budget_counters TO service_role;

ALTER TABLE public.daily_budget_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.daily_budget_counters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_daily_budget(
  _bucket_key TEXT,
  _max_per_day INT
)
RETURNS TABLE(allowed BOOLEAN, remaining INT, used INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'UTC')::date;
  current_count INT;
BEGIN
  INSERT INTO public.daily_budget_counters (bucket_key, day, count)
  VALUES (_bucket_key, today, 0)
  ON CONFLICT (bucket_key, day) DO NOTHING;

  SELECT count INTO current_count
  FROM public.daily_budget_counters
  WHERE bucket_key = _bucket_key AND day = today
  FOR UPDATE;

  IF current_count >= _max_per_day THEN
    RETURN QUERY SELECT FALSE, 0, current_count;
    RETURN;
  END IF;

  UPDATE public.daily_budget_counters
  SET count = count + 1, updated_at = now()
  WHERE bucket_key = _bucket_key AND day = today;

  RETURN QUERY SELECT TRUE, (_max_per_day - current_count - 1), (current_count + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_budget(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_daily_budget(TEXT, INT) TO service_role;
