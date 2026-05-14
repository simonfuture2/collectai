REVOKE EXECUTE ON FUNCTION public.consume_demo_scan(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_demo_scan(TEXT, INT) TO service_role;