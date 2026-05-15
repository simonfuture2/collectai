-- Generic IP rate limit table + function for unauthenticated edge functions
CREATE TABLE IF NOT EXISTS public.ip_rate_limits (
  bucket_key TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, ip_hash)
);

ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_ip_rate_limit(
  _bucket_key TEXT,
  _ip_hash TEXT,
  _max_requests INTEGER,
  _window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INT;
  current_window TIMESTAMPTZ;
BEGIN
  INSERT INTO public.ip_rate_limits (bucket_key, ip_hash, request_count, window_start)
  VALUES (_bucket_key, _ip_hash, 0, now())
  ON CONFLICT (bucket_key, ip_hash) DO NOTHING;

  SELECT request_count, window_start
    INTO current_count, current_window
  FROM public.ip_rate_limits
  WHERE bucket_key = _bucket_key AND ip_hash = _ip_hash
  FOR UPDATE;

  IF current_window < now() - make_interval(secs => _window_seconds) THEN
    UPDATE public.ip_rate_limits
    SET request_count = 0, window_start = now()
    WHERE bucket_key = _bucket_key AND ip_hash = _ip_hash;
    current_count := 0;
  END IF;

  IF current_count >= _max_requests THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  UPDATE public.ip_rate_limits
  SET request_count = request_count + 1
  WHERE bucket_key = _bucket_key AND ip_hash = _ip_hash;

  RETURN QUERY SELECT TRUE, (_max_requests - current_count - 1);
END;
$$;

-- Remove redundant cards public policy that bypassed the owner's profile-level toggle
DROP POLICY IF EXISTS "Anyone can view public cards" ON public.cards;