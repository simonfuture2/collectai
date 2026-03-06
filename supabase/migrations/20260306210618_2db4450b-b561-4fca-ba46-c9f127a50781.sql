
DROP POLICY "Service role can insert drip queue" ON public.drip_campaign_queue;

CREATE POLICY "Admins can insert drip queue" ON public.drip_campaign_queue
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
