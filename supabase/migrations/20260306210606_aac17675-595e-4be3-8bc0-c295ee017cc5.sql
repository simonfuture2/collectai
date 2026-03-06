
CREATE TABLE public.drip_campaign_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step integer NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  scheduled_for date NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drip_campaign_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view drip queue" ON public.drip_campaign_queue
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update drip queue" ON public.drip_campaign_queue
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete drip queue" ON public.drip_campaign_queue
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert drip queue" ON public.drip_campaign_queue
  FOR INSERT TO authenticated WITH CHECK (true);
