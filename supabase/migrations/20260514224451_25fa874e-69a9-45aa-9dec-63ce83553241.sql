CREATE TABLE public.demo_scan_rate_limit (
  ip_hash TEXT NOT NULL,
  scan_count INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash)
);

ALTER TABLE public.demo_scan_rate_limit ENABLE ROW LEVEL SECURITY;

-- No public policies; only service role bypasses RLS.

CREATE OR REPLACE FUNCTION public.consume_demo_scan(_ip_hash TEXT, _max_per_day INT DEFAULT 3)
RETURNS TABLE(allowed BOOLEAN, remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INT;
  current_window TIMESTAMPTZ;
BEGIN
  INSERT INTO public.demo_scan_rate_limit (ip_hash, scan_count, window_start)
  VALUES (_ip_hash, 0, now())
  ON CONFLICT (ip_hash) DO NOTHING;

  SELECT scan_count, window_start
    INTO current_count, current_window
  FROM public.demo_scan_rate_limit
  WHERE ip_hash = _ip_hash
  FOR UPDATE;

  IF current_window < now() - INTERVAL '24 hours' THEN
    UPDATE public.demo_scan_rate_limit
    SET scan_count = 0, window_start = now()
    WHERE ip_hash = _ip_hash;
    current_count := 0;
  END IF;

  IF current_count >= _max_per_day THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  UPDATE public.demo_scan_rate_limit
  SET scan_count = scan_count + 1
  WHERE ip_hash = _ip_hash;

  RETURN QUERY SELECT TRUE, (_max_per_day - current_count - 1);
END;
$$;