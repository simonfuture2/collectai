
REVOKE EXECUTE ON FUNCTION public.deduct_credit(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_credit(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credit(uuid) TO service_role;
