-- leads: scope admin policies to the authenticated role so anonymous
-- requests are rejected before policy evaluation. No public insert path exists.
DROP POLICY IF EXISTS "Admins can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can update leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON public.leads;

CREATE POLICY "Admins can view all leads"
ON public.leads FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert leads"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update leads"
ON public.leads FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete leads"
ON public.leads FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

REVOKE ALL ON public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- pricecharting_catalog: internal reference/pricing data read only by edge
-- functions with the service role. No client code reads it, so remove the
-- blanket authenticated read of wholesale buy/sell pricing.
DROP POLICY IF EXISTS "Authenticated users can read catalog" ON public.pricecharting_catalog;

REVOKE ALL ON public.pricecharting_catalog FROM anon;
REVOKE ALL ON public.pricecharting_catalog FROM authenticated;
GRANT ALL ON public.pricecharting_catalog TO service_role;