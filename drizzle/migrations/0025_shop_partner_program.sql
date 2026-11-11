CREATE TABLE public.partner_shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.agent_leads(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 48),
  city text, state text, address text, website text, logo_path text,
  owner_user_id uuid,
  partner_code text NOT NULL UNIQUE CHECK (partner_code ~ '^shop_[a-z0-9]{1,40}$'),
  rep_id uuid,
  tier text NOT NULL DEFAULT 'partner' CHECK (tier IN ('listed','partner','featured')),
  status text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding','active','paused')),
  joined_at timestamptz,
  notes text,
  revenue_share_pct numeric NOT NULL DEFAULT 0 CHECK (revenue_share_pct >= 0 AND revenue_share_pct <= 100),
  buy_offer_pct numeric NOT NULL DEFAULT 60 CHECK (buy_offer_pct > 0 AND buy_offer_pct <= 100),
  show_address boolean NOT NULL DEFAULT false,
  show_website boolean NOT NULL DEFAULT true,
  owner_approved_at timestamptz,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_shops_lead_idx ON public.partner_shops(lead_id);

CREATE TABLE public.partner_shop_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.partner_shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, user_id)
);
CREATE INDEX partner_shop_staff_user_idx ON public.partner_shop_staff(user_id);

CREATE TABLE public.partner_staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.partner_shops(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (shop_id, email)
);

ALTER TABLE public.user_credits ADD COLUMN billing_source text;

GRANT SELECT, UPDATE, INSERT, DELETE ON public.partner_shops TO authenticated;
GRANT ALL ON public.partner_shops TO service_role;
GRANT SELECT, DELETE ON public.partner_shop_staff TO authenticated;
GRANT ALL ON public.partner_shop_staff TO service_role;
GRANT SELECT, DELETE ON public.partner_staff_invites TO authenticated;
GRANT ALL ON public.partner_staff_invites TO service_role;

ALTER TABLE public.partner_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_staff_invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_shop_staff(_shop uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_shop_staff WHERE shop_id = _shop AND user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_shop_owner(_shop uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_shop_staff WHERE shop_id = _shop AND user_id = auth.uid() AND role = 'owner')
      OR EXISTS (SELECT 1 FROM public.partner_shops WHERE id = _shop AND owner_user_id = auth.uid())
$$;
-- Admins and the shop's rep run the program side (status, tier, revenue share).
CREATE OR REPLACE FUNCTION public.can_run_shop(_shop uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_lead_admin() OR EXISTS (SELECT 1 FROM public.partner_shops WHERE id = _shop AND rep_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.can_manage_shop(_shop uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_run_shop(_shop) OR public.is_shop_owner(_shop)
$$;

CREATE POLICY "partner shops readable by team" ON public.partner_shops FOR SELECT TO authenticated
  USING (public.can_manage_shop(id) OR public.is_shop_staff(id));
CREATE POLICY "partner shops insert by admin or rep" ON public.partner_shops FOR INSERT TO authenticated
  WITH CHECK (public.is_lead_admin() OR (public.is_sales_rep() AND rep_id = auth.uid()));
CREATE POLICY "partner shops update by managers" ON public.partner_shops FOR UPDATE TO authenticated
  USING (public.can_manage_shop(id)) WITH CHECK (public.can_manage_shop(id));
CREATE POLICY "partner shops delete by admin" ON public.partner_shops FOR DELETE TO authenticated
  USING (public.is_lead_admin());

CREATE POLICY "staff rows readable" ON public.partner_shop_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_shop(shop_id));
CREATE POLICY "staff rows removable by managers" ON public.partner_shop_staff FOR DELETE TO authenticated
  USING (public.can_manage_shop(shop_id));
CREATE POLICY "invites readable by managers" ON public.partner_staff_invites FOR SELECT TO authenticated
  USING (public.can_manage_shop(shop_id));
CREATE POLICY "invites removable by managers" ON public.partner_staff_invites FOR DELETE TO authenticated
  USING (public.can_manage_shop(shop_id));

-- Owners may edit their profile, never program terms.
CREATE OR REPLACE FUNCTION public.partner_shops_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL AND NOT public.can_run_shop(OLD.id) THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.revenue_share_pct IS DISTINCT FROM OLD.revenue_share_pct OR NEW.partner_code IS DISTINCT FROM OLD.partner_code
       OR NEW.slug IS DISTINCT FROM OLD.slug OR NEW.rep_id IS DISTINCT FROM OLD.rep_id
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
       OR NEW.owner_approved_at IS DISTINCT FROM OLD.owner_approved_at OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
      RAISE EXCEPTION 'Only the MyCollectAI team can change program settings';
    END IF;
  END IF;
  IF NEW.status = 'active' AND NEW.joined_at IS NULL THEN NEW.joined_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER partner_shops_guard BEFORE UPDATE ON public.partner_shops FOR EACH ROW EXECUTE FUNCTION public.partner_shops_guard();

-- Free Pro for staff of active shops. Never touches a Stripe-paid plan; only undoes what it set.
CREATE OR REPLACE FUNCTION public.partner_sync_user_pro(_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.partner_shop_staff s JOIN public.partner_shops p ON p.id = s.shop_id WHERE s.user_id = _user AND p.status = 'active') THEN
    UPDATE public.user_credits SET plan = 'pro', billing_source = 'partner', updated_at = now()
     WHERE user_id = _user AND stripe_subscription_id IS NULL AND plan <> 'pro';
  ELSE
    UPDATE public.user_credits SET plan = 'free', billing_source = NULL, updated_at = now()
     WHERE user_id = _user AND billing_source = 'partner' AND stripe_subscription_id IS NULL;
    UPDATE public.user_credits SET billing_source = NULL WHERE user_id = _user AND billing_source = 'partner';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.partner_sync_user_pro(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_staff_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.partner_sync_user_pro(coalesce(NEW.user_id, OLD.user_id));
  RETURN NULL;
END $$;
CREATE TRIGGER partner_staff_changed AFTER INSERT OR DELETE ON public.partner_shop_staff FOR EACH ROW EXECUTE FUNCTION public.partner_staff_changed();

CREATE OR REPLACE FUNCTION public.partner_shop_status_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT user_id FROM public.partner_shop_staff WHERE shop_id = NEW.id LOOP
    PERFORM public.partner_sync_user_pro(u);
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER partner_shop_status_changed AFTER UPDATE OF status ON public.partner_shops FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.partner_shop_status_changed();

-- Slug / code generation (mirrors slugify/partnerCodeFor in src/lib/partnerShops.ts).
CREATE OR REPLACE FUNCTION public.partner_slugify(_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(left(trim(both '-' from regexp_replace(lower(coalesce(_name, '')), '[^a-z0-9]+', '-', 'g')), 40), ''), 'shop')
$$;
CREATE OR REPLACE FUNCTION public.partner_unique_slug(_name text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base text := trim(both '-' from public.partner_slugify(_name)); s text := base; n int := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.partner_shops WHERE slug = s) LOOP n := n + 1; s := base || '-' || n; END LOOP;
  RETURN s;
END $$;
CREATE OR REPLACE FUNCTION public.partner_unique_code(_name text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base text := 'shop_' || coalesce(nullif(left(regexp_replace(lower(coalesce(_name, '')), '[^a-z0-9]+', '', 'g'), 24), ''), 'partner'); c text := base; n int := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.partner_shops WHERE partner_code = c) OR EXISTS (SELECT 1 FROM public.agent_leads WHERE partner_code = c) LOOP
    n := n + 1; c := base || n;
  END LOOP;
  RETURN c;
END $$;

-- Creates (or returns) the shop for a lead and drafts the welcome email for approval.
CREATE OR REPLACE FUNCTION public.partner_create_from_lead(_lead_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.agent_leads; v_id uuid; v_slug text; v_code text; v_name text; v_body text;
BEGIN
  SELECT * INTO l FROM public.agent_leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (public.is_lead_admin() OR public.rep_owns_lead(_lead_id)) THEN RAISE EXCEPTION 'not your lead'; END IF;
  SELECT id INTO v_id FROM public.partner_shops WHERE lead_id = _lead_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  v_name := coalesce(nullif(l.business_name, ''), nullif(l.name, ''), 'Card shop');
  v_slug := public.partner_unique_slug(v_name);
  v_code := CASE WHEN l.partner_code ~ '^shop_[a-z0-9]{1,40}$' AND NOT EXISTS (SELECT 1 FROM public.partner_shops WHERE partner_code = l.partner_code)
                 THEN l.partner_code ELSE public.partner_unique_code(v_name) END;
  INSERT INTO public.partner_shops (lead_id, name, slug, city, state, website, partner_code, rep_id)
  VALUES (_lead_id, v_name, v_slug, l.city, l.state, l.website, v_code, l.owner_id) RETURNING id INTO v_id;
  UPDATE public.agent_leads SET partner_code = v_code WHERE id = _lead_id AND partner_code IS DISTINCT FROM v_code;
  INSERT INTO public.agent_activities (lead_id, rep_id, type, body, meta)
  VALUES (_lead_id, l.owner_id, 'note', 'Partner shop page created: mycollectai.com/s/' || v_slug, jsonb_build_object('partner_shop_id', v_id));
  IF l.email IS NOT NULL AND NOT coalesce(l.do_not_contact, false) THEN
    v_body := 'Hi ' || coalesce(split_part(nullif(l.name, ''), ' ', 1), 'there') || ',' || E'\n\n'
      || 'Welcome to the MyCollectAI shop partner program. Your shop page is ready for you to look over:' || E'\n'
      || 'https://mycollectai.com/s/' || v_slug || E'\n\n'
      || 'Once you sign in at https://mycollectai.com/partner you can approve the page, add your logo, download your counter sign and QR code, and invite your staff. Staff just create a free account with the email you invite, then open that same link, and they get Pro free while the shop is active.' || E'\n\n'
      || 'Does the page look right to you?';
    INSERT INTO public.agent_outreach (lead_id, workflow, channel, subject, draft_text, status)
    VALUES (_lead_id, 'email_outreach', 'email', 'Your MyCollectAI shop page is ready', v_body, 'pending');
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.partner_create_from_lead(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_on_lead_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.stage = 'partner_onboarding' THEN
      PERFORM public.partner_create_from_lead(NEW.id);
    ELSIF NEW.stage = 'active_partner' THEN
      UPDATE public.partner_shops SET status = 'active' WHERE lead_id = NEW.id AND status = 'onboarding';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'partner_on_lead_stage failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER agent_leads_partner_stage AFTER UPDATE OF stage ON public.agent_leads FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage IN ('partner_onboarding','active_partner'))
  EXECUTE FUNCTION public.partner_on_lead_stage();

-- Public page data (active shops, or onboarding shops so the owner can review before approving).
CREATE OR REPLACE FUNCTION public.partner_shop_public(_slug text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', id, 'name', name, 'slug', slug, 'status', status, 'partner_code', partner_code,
    'city', city, 'state', state, 'logo_path', logo_path,
    'address', CASE WHEN show_address THEN address END, 'website', CASE WHEN show_website THEN website END)
  FROM public.partner_shops WHERE slug = lower(_slug) AND status IN ('active','onboarding')
$$;
GRANT EXECUTE ON FUNCTION public.partner_shop_public(text) TO anon, authenticated;

-- Owner approves their page: shop goes active and the lead moves to active_partner.
CREATE OR REPLACE FUNCTION public.partner_approve_page(_shop uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.partner_shops;
BEGIN
  IF NOT public.can_manage_shop(_shop) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO p FROM public.partner_shops WHERE id = _shop;
  UPDATE public.partner_shops SET owner_approved_at = coalesce(owner_approved_at, now()),
    status = CASE WHEN status = 'onboarding' THEN 'active' ELSE status END,
    checklist = checklist || '{"page_approved": true}'::jsonb WHERE id = _shop;
  IF p.lead_id IS NOT NULL THEN
    UPDATE public.agent_leads SET stage = 'active_partner' WHERE id = p.lead_id AND stage <> 'active_partner';
    INSERT INTO public.agent_activities (lead_id, rep_id, type, body, meta)
    VALUES (p.lead_id, p.rep_id, 'stage_change', 'Owner approved the shop page', jsonb_build_object('to', 'active_partner'));
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.partner_approve_page(uuid) TO authenticated;

-- Invite staff by email: existing accounts join at once, others when they sign in.
CREATE OR REPLACE FUNCTION public.partner_invite_staff(_shop uuid, _email text, _role text DEFAULT 'staff') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text := lower(trim(_email)); v_user uuid;
BEGIN
  IF NOT public.can_manage_shop(_shop) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'bad role'; END IF;
  IF _role = 'owner' AND NOT public.can_run_shop(_shop) THEN RAISE EXCEPTION 'only the team can add owners'; END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'invalid email'; END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user IS NOT NULL THEN
    INSERT INTO public.partner_shop_staff (shop_id, user_id, role) VALUES (_shop, v_user, _role)
      ON CONFLICT (shop_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    IF _role = 'owner' THEN UPDATE public.partner_shops SET owner_user_id = v_user WHERE id = _shop AND owner_user_id IS NULL; END IF;
    RETURN jsonb_build_object('added', true);
  END IF;
  INSERT INTO public.partner_staff_invites (shop_id, email, role, invited_by) VALUES (_shop, v_email, _role, auth.uid())
    ON CONFLICT (shop_id, email) DO UPDATE SET role = EXCLUDED.role, accepted_at = NULL;
  RETURN jsonb_build_object('added', false, 'invited', true);
END $$;
GRANT EXECUTE ON FUNCTION public.partner_invite_staff(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_claim_invites() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; i record; n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  FOR i IN SELECT * FROM public.partner_staff_invites WHERE email = v_email AND accepted_at IS NULL LOOP
    INSERT INTO public.partner_shop_staff (shop_id, user_id, role) VALUES (i.shop_id, auth.uid(), i.role) ON CONFLICT DO NOTHING;
    IF i.role = 'owner' THEN UPDATE public.partner_shops SET owner_user_id = auth.uid() WHERE id = i.shop_id AND owner_user_id IS NULL; END IF;
    UPDATE public.partner_staff_invites SET accepted_at = now() WHERE id = i.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.partner_claim_invites() TO authenticated;

-- Shop dashboard numbers for a period.
CREATE OR REPLACE FUNCTION public.partner_stats(_shop uuid, _since timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.partner_shops; v jsonb;
BEGIN
  IF NOT (public.can_manage_shop(_shop) OR public.is_shop_staff(_shop)) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO p FROM public.partner_shops WHERE id = _shop;
  WITH u AS (
    SELECT DISTINCT ON (a.user_id) a.user_id, a.created_at FROM public.agent_attribution a
     WHERE a.ref_code = p.partner_code AND a.event_type = 'signup' AND a.user_id IS NOT NULL ORDER BY a.user_id, a.created_at
  )
  SELECT jsonb_build_object(
    'signups', (SELECT count(*) FROM u WHERE u.created_at >= _since),
    'signups_total', (SELECT count(*) FROM u),
    'price_checks', (SELECT count(*) FROM public.price_checks c JOIN u ON u.user_id = c.user_id WHERE c.created_at >= _since),
    'paid_conversions', (SELECT count(*) FROM public.credit_transactions t JOIN u ON u.user_id = t.user_id
        WHERE t.type IN ('subscription','credit_purchase','subscription_renewal','play_purchase') AND t.created_at >= _since
          AND t.created_at < u.created_at + interval '12 months'),
    'revenue_share_pct', p.revenue_share_pct) INTO v;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.partner_stats(uuid, timestamptz) TO authenticated;

-- Admin monthly revenue-share report (reporting only; payouts happen outside the app).
CREATE OR REPLACE FUNCTION public.partner_revenue_report(_since timestamptz, _until timestamptz)
RETURNS TABLE(shop_id uuid, name text, partner_code text, status text, revenue_share_pct numeric, signups bigint, conversions bigint, revenue_cents bigint, owed_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_lead_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
  WITH u AS (
    SELECT DISTINCT ON (a.user_id) s.id AS shop, a.user_id, a.created_at FROM public.agent_attribution a
     JOIN public.partner_shops s ON s.partner_code = a.ref_code
     WHERE a.event_type = 'signup' AND a.user_id IS NOT NULL ORDER BY a.user_id, a.created_at
  ), pays AS (
    SELECT u.shop, coalesce(t.amount_cents, 0) AS cents FROM u JOIN public.credit_transactions t ON t.user_id = u.user_id
     WHERE t.type IN ('subscription','credit_purchase','subscription_renewal','play_purchase')
       AND t.created_at >= _since AND t.created_at < _until AND t.created_at < u.created_at + interval '12 months'
  )
  SELECT s.id, s.name, s.partner_code, s.status, s.revenue_share_pct,
    (SELECT count(*) FROM u WHERE u.shop = s.id AND u.created_at >= _since AND u.created_at < _until),
    (SELECT count(*) FROM pays WHERE pays.shop = s.id),
    (SELECT coalesce(sum(cents), 0)::bigint FROM pays WHERE pays.shop = s.id),
    (SELECT round(coalesce(sum(cents), 0) * s.revenue_share_pct / 100)::bigint FROM pays WHERE pays.shop = s.id)
  FROM public.partner_shops s ORDER BY s.name;
END $$;
GRANT EXECUTE ON FUNCTION public.partner_revenue_report(timestamptz, timestamptz) TO authenticated;

-- Logos: private bucket, path <shop_id>/<file>.
CREATE POLICY "partner logos readable" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'partner-logos' AND EXISTS (SELECT 1 FROM public.partner_shops p WHERE p.id::text = (storage.foldername(name))[1]
    AND (p.status = 'active' OR public.can_manage_shop(p.id) OR public.is_shop_staff(p.id))));
CREATE POLICY "partner logos upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'partner-logos' AND public.can_manage_shop(((storage.foldername(name))[1])::uuid));
CREATE POLICY "partner logos update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'partner-logos' AND public.can_manage_shop(((storage.foldername(name))[1])::uuid));
CREATE POLICY "partner logos delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'partner-logos' AND public.can_manage_shop(((storage.foldername(name))[1])::uuid));