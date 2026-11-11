ALTER TABLE public.agent_leads
  ADD COLUMN IF NOT EXISTS research jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enrich_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS enrich_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS followers integer,
  ADD COLUMN IF NOT EXISTS event_id uuid;
CREATE INDEX IF NOT EXISTS agent_leads_place_id_idx ON public.agent_leads(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_leads_enrich_idx ON public.agent_leads(enrich_status) WHERE website IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text, state text,
  start_date date,
  url text, notes text,
  ref_code text UNIQUE,
  checklist jsonb NOT NULL DEFAULT '{"qr_flyers":false,"demo_phone":false,"vendor_cards":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_events TO authenticated;
GRANT ALL ON public.agent_events TO service_role;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage events" ON public.agent_events FOR ALL TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.agent_lead_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'daily',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_lead_runs TO authenticated;
GRANT ALL ON public.agent_lead_runs TO service_role;
ALTER TABLE public.agent_lead_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read lead runs" ON public.agent_lead_runs FOR SELECT TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid()));

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS friend_reward_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS friend_credited_at timestamptz,
  ADD COLUMN IF NOT EXISTS referrer_amount integer;
UPDATE public.referrals SET friend_reward_eligible = false WHERE created_at < now();

-- Friend reward: 3 credits after the friend's 5th price check (new referrals only).
CREATE OR REPLACE FUNCTION public.referral_friend_reward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.referrals; n integer;
BEGIN
  SELECT * INTO r FROM public.referrals
   WHERE referred_id = NEW.user_id AND friend_reward_eligible AND friend_credited_at IS NULL FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM public.price_checks WHERE user_id = NEW.user_id;
  IF n < 5 THEN RETURN NEW; END IF;
  UPDATE public.referrals SET friend_credited_at = now() WHERE id = r.id;
  PERFORM public.add_credits(NEW.user_id, 3);
  INSERT INTO public.credit_transactions(user_id, amount, type, description)
  VALUES (NEW.user_id, 3, 'referral_friend_bonus', 'Welcome bonus for joining with a friend''s link');
  INSERT INTO public.agent_attribution(ref_code, event_type, user_id, meta)
  VALUES (r.referral_code, 'referral_friend_rewarded', NEW.user_id, '{}'::jsonb);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS price_checks_referral_reward ON public.price_checks;
CREATE TRIGGER price_checks_referral_reward AFTER INSERT ON public.price_checks
  FOR EACH ROW EXECUTE FUNCTION public.referral_friend_reward();