CREATE OR REPLACE FUNCTION public.refund_demo_scan(_ip_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.demo_scan_rate_limit SET scan_count = GREATEST(scan_count - 1, 0) WHERE ip_hash = _ip_hash;
  UPDATE public.daily_budget_counters SET count = GREATEST(count - 1, 0), updated_at = now()
    WHERE bucket_key = 'demo_scan' AND day = (now() AT TIME ZONE 'UTC')::date;
END; $$;
REVOKE ALL ON FUNCTION public.refund_demo_scan(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_demo_scan(text) TO service_role;