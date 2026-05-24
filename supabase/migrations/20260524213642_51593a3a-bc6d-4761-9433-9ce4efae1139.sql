
-- 1) Restrict marketplace_listings SELECT to authenticated users (hide seller_wallet from anon)
DROP POLICY IF EXISTS "Anyone views active listings" ON public.marketplace_listings;

CREATE POLICY "Authenticated users view active listings"
ON public.marketplace_listings
FOR SELECT
TO authenticated
USING (status = 'active'::listing_status OR auth.uid() = seller_id);

-- 2) Lock down ip_rate_limits to service role only (deny all client access explicitly)
CREATE POLICY "Deny all client select on ip_rate_limits"
ON public.ip_rate_limits
FOR SELECT
TO anon, authenticated
USING (false);

CREATE POLICY "Deny all client insert on ip_rate_limits"
ON public.ip_rate_limits
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny all client update on ip_rate_limits"
ON public.ip_rate_limits
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny all client delete on ip_rate_limits"
ON public.ip_rate_limits
FOR DELETE
TO anon, authenticated
USING (false);
