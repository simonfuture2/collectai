
-- 1) Remove sensitive cards table from Realtime publication (CardDetail still polls every 8s)
ALTER PUBLICATION supabase_realtime DROP TABLE public.cards;

-- 2) Deny-all SELECT on demo_scan_rate_limit for client roles (mirrors ip_rate_limits pattern)
CREATE POLICY "Deny all client reads" ON public.demo_scan_rate_limit
  FOR SELECT TO anon, authenticated USING (false);

-- 3) Restrict realtime.messages: only allow subscriptions where topic ends with the user's uid
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can only subscribe to own topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE ('%' || auth.uid()::text)
    OR realtime.topic() LIKE ('card-%')
  );
