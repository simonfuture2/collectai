-- Sales reps: a rep works their own leads plus unassigned leads in their territories.
CREATE TABLE public.sales_reps (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL,
  email text,
  email_signature text,
  phone text,
  territories text[] NOT NULL DEFAULT '{}',
  booking_link text,
  daily_touch_goal integer NOT NULL DEFAULT 50,
  commission_rate numeric NOT NULL DEFAULT 0,
  ref_code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  last_assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_reps_ref_code_format CHECK (ref_code ~ '^[a-z0-9_\-]{2,64}$'),
  CONSTRAINT sales_reps_goal CHECK (daily_touch_goal BETWEEN 0 AND 1000),
  CONSTRAINT sales_reps_rate CHECK (commission_rate BETWEEN 0 AND 100)
);
GRANT SELECT ON public.sales_reps TO authenticated;
GRANT ALL ON public.sales_reps TO service_role;
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_rep_invites (
  email text PRIMARY KEY,
  display_name text NOT NULL,
  territories text[] NOT NULL DEFAULT '{}',
  daily_touch_goal integer NOT NULL DEFAULT 50,
  commission_rate numeric NOT NULL DEFAULT 0,
  ref_code text NOT NULL UNIQUE,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_user_id uuid,
  accepted_at timestamptz
);
GRANT SELECT ON public.sales_rep_invites TO authenticated;
GRANT ALL ON public.sales_rep_invites TO service_role;
ALTER TABLE public.sales_rep_invites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agent_leads ADD COLUMN IF NOT EXISTS county text;
ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS reply_to text, ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS amount_cents integer;
CREATE INDEX IF NOT EXISTS agent_leads_owner_idx ON public.agent_leads(owner_id);
CREATE INDEX IF NOT EXISTS agent_activities_rep_idx ON public.agent_activities(rep_id, created_at);

ALTER TABLE public.agent_outreach DROP CONSTRAINT agent_outreach_workflow_check;
ALTER TABLE public.agent_outreach ADD CONSTRAINT agent_outreach_workflow_check CHECK (workflow = ANY (ARRAY['ig_comment_dm','community_drafts','email_outreach','sequence_optin','sequence_task','rep_task']));

-- Helpers ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_sales_rep() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sales_reps WHERE user_id = auth.uid() AND active);
$$;

CREATE OR REPLACE FUNCTION public.is_lead_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_agent_admin() OR public.is_admin(auth.uid());
$$;

-- Territory 'MD' matches the whole state; 'MD:Harford' matches that county only.
CREATE OR REPLACE FUNCTION public.rep_territory_match(_territories text[], _state text, _county text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(_state, '') <> '' AND EXISTS (
    SELECT 1 FROM unnest(coalesce(_territories, '{}')) t
     WHERE upper(split_part(t, ':', 1)) = upper(btrim(_state))
       AND (position(':' in t) = 0 OR lower(regexp_replace(split_part(t, ':', 2), '\s+county$', '', 'i'))
                                        = lower(regexp_replace(coalesce(btrim(_county), ''), '\s+county$', '', 'i'))));
$$;

CREATE OR REPLACE FUNCTION public.rep_can_see_lead(_lead_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_leads l JOIN public.sales_reps r ON r.user_id = auth.uid() AND r.active
     WHERE l.id = _lead_id AND (l.owner_id = r.user_id OR (l.owner_id IS NULL AND public.rep_territory_match(r.territories, l.state, l.county))));
$$;

CREATE OR REPLACE FUNCTION public.rep_owns_lead(_lead_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agent_leads l JOIN public.sales_reps r ON r.user_id = l.owner_id AND r.active
                  WHERE l.id = _lead_id AND l.owner_id = auth.uid());
$$;

-- Policies -----------------------------------------------------------
CREATE POLICY "admins manage reps" ON public.sales_reps FOR ALL TO authenticated USING (public.is_lead_admin()) WITH CHECK (public.is_lead_admin());
CREATE POLICY "rep reads own row" ON public.sales_reps FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins manage rep invites" ON public.sales_rep_invites FOR ALL TO authenticated USING (public.is_lead_admin()) WITH CHECK (public.is_lead_admin());

CREATE POLICY "rep reads own and claimable leads" ON public.agent_leads FOR SELECT TO authenticated
  USING (public.is_sales_rep() AND (owner_id = auth.uid() OR (owner_id IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_reps r WHERE r.user_id = auth.uid() AND public.rep_territory_match(r.territories, state, county)))));
CREATE POLICY "rep updates own and claims leads" ON public.agent_leads FOR UPDATE TO authenticated
  USING (public.is_sales_rep() AND (owner_id = auth.uid() OR (owner_id IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_reps r WHERE r.user_id = auth.uid() AND public.rep_territory_match(r.territories, state, county)))))
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "rep reads own lead activities" ON public.agent_activities FOR SELECT TO authenticated USING (public.rep_owns_lead(lead_id));
CREATE POLICY "rep logs own lead activities" ON public.agent_activities FOR INSERT TO authenticated WITH CHECK (rep_id = auth.uid() AND public.rep_owns_lead(lead_id));
CREATE POLICY "rep reads own lead enrollments" ON public.agent_enrollments FOR SELECT TO authenticated USING (lead_id IS NOT NULL AND public.rep_owns_lead(lead_id));
CREATE POLICY "rep reads own lead outreach" ON public.agent_outreach FOR SELECT TO authenticated USING (lead_id IS NOT NULL AND public.rep_owns_lead(lead_id));
CREATE POLICY "rep approves own lead outreach" ON public.agent_outreach FOR UPDATE TO authenticated
  USING (lead_id IS NOT NULL AND public.rep_owns_lead(lead_id) AND status IN ('pending','approved','rejected','done'))
  WITH CHECK (lead_id IS NOT NULL AND public.rep_owns_lead(lead_id) AND status IN ('pending','approved','rejected','done'));
CREATE POLICY "rep reads own lead replies" ON public.agent_replies FOR SELECT TO authenticated USING (lead_id IS NOT NULL AND public.rep_owns_lead(lead_id));

-- Assignment ---------------------------------------------------------
-- Round-robin: the matching active rep who was assigned a lead longest ago.
CREATE OR REPLACE FUNCTION public.pick_rep_for(_state text, _county text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  SELECT user_id INTO v FROM public.sales_reps
   WHERE active AND public.rep_territory_match(territories, _state, _county)
   ORDER BY last_assigned_at NULLS FIRST, created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v IS NOT NULL THEN UPDATE public.sales_reps SET last_assigned_at = clock_timestamp() WHERE user_id = v; END IF;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.pick_rep_for(text, text) FROM PUBLIC, anon, authenticated;

-- New leads go to a territory rep when they have no owner or are only parked on an admin.
CREATE OR REPLACE FUNCTION public.agent_leads_auto_assign() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NEW.owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.sales_reps WHERE user_id = NEW.owner_id) THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM public.agent_admins WHERE user_id = NEW.owner_id) OR public.is_admin(NEW.owner_id)) THEN RETURN NEW; END IF;
  v := public.pick_rep_for(NEW.state, NEW.county);
  IF v IS NOT NULL THEN NEW.owner_id := v; END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
CREATE TRIGGER agent_leads_auto_assign_trg BEFORE INSERT ON public.agent_leads FOR EACH ROW EXECUTE FUNCTION public.agent_leads_auto_assign();

CREATE OR REPLACE FUNCTION public.admin_assign_unassigned() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v uuid; n int := 0;
BEGIN
  IF NOT public.is_lead_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  FOR l IN SELECT id, state, county FROM public.agent_leads WHERE owner_id IS NULL AND merged_into IS NULL ORDER BY created_at LIMIT 2000 LOOP
    v := public.pick_rep_for(l.state, l.county);
    IF v IS NOT NULL THEN UPDATE public.agent_leads SET owner_id = v WHERE id = l.id; n := n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('assigned', n);
END $$;

CREATE OR REPLACE FUNCTION public.admin_reassign_lead(_lead_id uuid, _owner uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_lead_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.agent_leads SET owner_id = _owner WHERE id = _lead_id;
  INSERT INTO public.agent_activities (lead_id, rep_id, type, body, meta)
  VALUES (_lead_id, auth.uid(), 'note', 'Reassigned', jsonb_build_object('owner', _owner));
END $$;

-- Invites ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_invite_rep(_email text, _display_name text, _ref_code text, _territories text[] DEFAULT '{}', _goal integer DEFAULT 50, _rate numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text := lower(btrim(_email)); v_uid uuid; v_ref text := lower(btrim(_ref_code));
BEGIN
  IF NOT public.is_lead_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_reps WHERE ref_code = v_ref) OR EXISTS (SELECT 1 FROM public.sales_rep_invites WHERE ref_code = v_ref AND email <> v_email) THEN
    RAISE EXCEPTION 'That ref code is already taken'; END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.sales_reps (user_id, display_name, email, territories, daily_touch_goal, commission_rate, ref_code)
    VALUES (v_uid, _display_name, v_email, coalesce(_territories, '{}'), _goal, _rate, v_ref)
    ON CONFLICT (user_id) DO UPDATE SET active = true, display_name = EXCLUDED.display_name, territories = EXCLUDED.territories,
      daily_touch_goal = EXCLUDED.daily_touch_goal, commission_rate = EXCLUDED.commission_rate;
    RETURN jsonb_build_object('status', 'added', 'user_id', v_uid);
  END IF;
  INSERT INTO public.sales_rep_invites (email, display_name, territories, daily_touch_goal, commission_rate, ref_code, invited_by)
  VALUES (v_email, _display_name, coalesce(_territories, '{}'), _goal, _rate, v_ref, auth.uid())
  ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, territories = EXCLUDED.territories,
    daily_touch_goal = EXCLUDED.daily_touch_goal, commission_rate = EXCLUDED.commission_rate, ref_code = EXCLUDED.ref_code;
  RETURN jsonb_build_object('status', 'invited');
END $$;

-- Called by the signed-in user: turns a pending invite for their email into a rep row.
CREATE OR REPLACE FUNCTION public.accept_rep_invite() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; i record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO i FROM public.sales_rep_invites WHERE email = v_email AND accepted_at IS NULL;
  IF i.email IS NULL THEN RETURN public.is_sales_rep(); END IF;
  INSERT INTO public.sales_reps (user_id, display_name, email, territories, daily_touch_goal, commission_rate, ref_code)
  VALUES (auth.uid(), i.display_name, v_email, i.territories, i.daily_touch_goal, i.commission_rate, i.ref_code)
  ON CONFLICT (user_id) DO UPDATE SET active = true;
  UPDATE public.sales_rep_invites SET accepted_user_id = auth.uid(), accepted_at = now() WHERE email = v_email;
  RETURN true;
END $$;

-- A rep edits their own contact details (not territories, goals or rates).
CREATE OR REPLACE FUNCTION public.rep_update_profile(_display_name text, _signature text, _phone text, _booking_link text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_sales_rep() THEN RAISE EXCEPTION 'not a rep'; END IF;
  IF _booking_link IS NOT NULL AND _booking_link <> '' AND _booking_link !~ '^https://' THEN RAISE EXCEPTION 'Booking link must start with https://'; END IF;
  UPDATE public.sales_reps SET display_name = coalesce(nullif(btrim(_display_name), ''), display_name), email_signature = left(_signature, 1000),
    phone = left(_phone, 40), booking_link = nullif(btrim(_booking_link), '') WHERE user_id = auth.uid();
END $$;

-- Rep actions --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rep_claim_lead(_lead_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_sales_rep() THEN RAISE EXCEPTION 'not a rep'; END IF;
  UPDATE public.agent_leads l SET owner_id = auth.uid()
   WHERE l.id = _lead_id AND l.owner_id IS NULL
     AND EXISTS (SELECT 1 FROM public.sales_reps r WHERE r.user_id = auth.uid() AND public.rep_territory_match(r.territories, l.state, l.county));
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.agent_activities (lead_id, rep_id, type, body) VALUES (_lead_id, auth.uid(), 'note', 'Claimed by rep');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.rep_set_stage(_lead_id uuid, _stage text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text;
BEGIN
  IF NOT (public.rep_owns_lead(_lead_id) OR public.is_lead_admin()) THEN RAISE EXCEPTION 'not your lead'; END IF;
  SELECT stage INTO v_old FROM public.agent_leads WHERE id = _lead_id;
  IF v_old IS NOT DISTINCT FROM _stage THEN RETURN; END IF;
  UPDATE public.agent_leads SET stage = _stage, do_not_contact = do_not_contact OR _stage = 'do_not_contact' WHERE id = _lead_id;
  INSERT INTO public.agent_activities (lead_id, rep_id, type, body, meta)
  VALUES (_lead_id, auth.uid(), 'stage_change', v_old || ' → ' || _stage, jsonb_build_object('from', v_old, 'to', _stage));
END $$;

-- Call outcomes. Never an auto-dialer: the rep dials from their own phone, then taps one of these.
CREATE OR REPLACE FUNCTION public.rep_log_call(_lead_id uuid, _outcome text, _note text DEFAULT NULL, _task_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_label text;
BEGIN
  IF NOT (public.rep_owns_lead(_lead_id) OR public.is_lead_admin()) THEN RAISE EXCEPTION 'not your lead'; END IF;
  v_label := CASE _outcome WHEN 'no_answer' THEN 'No answer' WHEN 'voicemail' THEN 'Left voicemail' WHEN 'interested' THEN 'Talked – interested'
    WHEN 'not_now' THEN 'Talked – not now' WHEN 'wrong_number' THEN 'Wrong number' WHEN 'do_not_contact' THEN 'Do not contact' END;
  IF v_label IS NULL THEN RAISE EXCEPTION 'unknown outcome %', _outcome; END IF;
  INSERT INTO public.agent_activities (lead_id, rep_id, type, body, meta)
  VALUES (_lead_id, auth.uid(), 'call', v_label || coalesce(': ' || nullif(btrim(_note), ''), ''), jsonb_build_object('outcome', _outcome));
  UPDATE public.agent_leads SET last_contacted_at = now() WHERE id = _lead_id;
  IF _task_id IS NOT NULL THEN
    UPDATE public.agent_outreach SET status = 'done', decided_at = now(), final_text = coalesce(final_text, draft_text) WHERE id = _task_id AND lead_id = _lead_id;
  END IF;
  IF _outcome IN ('no_answer', 'voicemail') THEN
    UPDATE public.agent_leads SET next_action = 'Call again', next_action_at = now() + interval '2 days' WHERE id = _lead_id;
  ELSIF _outcome = 'interested' THEN
    UPDATE public.agent_leads SET stage = 'replied', next_action = 'Book a meeting', next_action_at = now() WHERE id = _lead_id;
    PERFORM public.agent_stop_enrollment(NULL, _lead_id, 'stopped_reply', 'talked on the phone – interested');
  ELSIF _outcome = 'not_now' THEN
    UPDATE public.agent_leads SET next_action = 'Check back', next_action_at = now() + interval '30 days' WHERE id = _lead_id;
    PERFORM public.agent_stop_enrollment(NULL, _lead_id, 'paused', 'talked on the phone – not now');
  ELSIF _outcome = 'wrong_number' THEN
    UPDATE public.agent_leads SET phone = NULL, notes = concat_ws(E'\n', notes, 'Wrong number removed ' || to_char(now(), 'YYYY-MM-DD')) WHERE id = _lead_id;
  ELSIF _outcome = 'do_not_contact' THEN
    UPDATE public.agent_leads SET do_not_contact = true, stage = 'do_not_contact' WHERE id = _lead_id RETURNING email INTO v_email;
    IF v_email IS NOT NULL THEN PERFORM public.suppress_email(v_email, 'do_not_contact', 'rep_call'); END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'outcome', _outcome);
END $$;

CREATE OR REPLACE FUNCTION public.rep_log_touch(_lead_id uuid, _kind text, _note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.rep_owns_lead(_lead_id) OR public.is_lead_admin()) THEN RAISE EXCEPTION 'not your lead'; END IF;
  IF _kind NOT IN ('dm', 'note') THEN RAISE EXCEPTION 'unknown kind'; END IF;
  INSERT INTO public.agent_activities (lead_id, rep_id, type, body) VALUES (_lead_id, auth.uid(), _kind, left(_note, 2000));
  IF _kind = 'dm' THEN UPDATE public.agent_leads SET last_contacted_at = now() WHERE id = _lead_id; END IF;
END $$;

-- A reply the lead sent straight to the rep's own inbox, pasted in so it still stops the sequence.
CREATE OR REPLACE FUNCTION public.rep_log_reply(_lead_id uuid, _body text, _intent text DEFAULT 'other') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF NOT (public.rep_owns_lead(_lead_id) OR public.is_lead_admin()) THEN RAISE EXCEPTION 'not your lead'; END IF;
  SELECT email INTO v_email FROM public.agent_leads WHERE id = _lead_id;
  RETURN public.agent_record_reply(_lead_id, 'rep:' || gen_random_uuid(), v_email, 'Reply logged by rep', _body, _intent, left(_body, 300));
END $$;

-- Stats --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rep_stats(_rep uuid, _since timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sales_reps; v jsonb;
BEGIN
  IF NOT (_rep = auth.uid() OR public.is_lead_admin()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO r FROM public.sales_reps WHERE user_id = _rep;
  SELECT jsonb_build_object(
    'emails', (SELECT count(*) FROM public.agent_outreach o JOIN public.agent_leads l ON l.id = o.lead_id
                WHERE l.owner_id = _rep AND o.channel = 'email' AND o.status = 'sent' AND o.sent_at >= _since),
    'calls', (SELECT count(*) FROM public.agent_activities WHERE rep_id = _rep AND type = 'call' AND created_at >= _since),
    'dms', (SELECT count(*) FROM public.agent_activities WHERE rep_id = _rep AND type = 'dm' AND created_at >= _since),
    'replies', (SELECT count(*) FROM public.agent_replies x JOIN public.agent_leads l ON l.id = x.lead_id
                 WHERE l.owner_id = _rep AND x.received_at >= _since AND coalesce(x.intent, '') <> 'auto_reply'),
    'meetings', (SELECT count(*) FROM public.agent_activities WHERE rep_id = _rep AND type = 'meeting_booked' AND created_at >= _since),
    'partners', (SELECT count(*) FROM public.agent_activities WHERE rep_id = _rep AND type = 'stage_change' AND meta->>'to' = 'active_partner' AND created_at >= _since),
    'signups', (SELECT count(DISTINCT a.user_id) FROM public.agent_attribution a
                 WHERE a.event_type = 'signup' AND a.created_at >= _since
                   AND (a.ref_code = r.ref_code OR a.ref_code IN (SELECT partner_code FROM public.agent_leads WHERE owner_id = _rep AND partner_code IS NOT NULL))),
    'goal', coalesce(r.daily_touch_goal, 50)) INTO v;
  RETURN v || jsonb_build_object('touches', (v->>'emails')::int + (v->>'calls')::int + (v->>'dms')::int);
END $$;

CREATE OR REPLACE FUNCTION public.rep_leaderboard(_since timestamptz) RETURNS TABLE(user_id uuid, display_name text, active boolean, stats jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_lead_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY SELECT r.user_id, r.display_name, r.active, public.rep_stats(r.user_id, _since) FROM public.sales_reps r ORDER BY r.display_name;
END $$;

-- Commission report (reporting only): sign-ups and paid conversions from the rep's ref code and their activated partners.
CREATE OR REPLACE FUNCTION public.rep_commission_report(_since timestamptz, _until timestamptz DEFAULT now())
RETURNS TABLE(user_id uuid, display_name text, ref_code text, commission_rate numeric, signups bigint, paid_users bigint, paid_conversions bigint, revenue_cents bigint, commission_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_lead_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
  WITH codes AS (
    SELECT r.user_id AS rep, r.ref_code AS code FROM public.sales_reps r
    UNION SELECT l.owner_id, l.partner_code FROM public.agent_leads l
     JOIN public.sales_reps r2 ON r2.user_id = l.owner_id WHERE l.partner_code IS NOT NULL AND l.stage = 'active_partner'
  ), users AS (
    SELECT DISTINCT ON (a.user_id) c.rep, a.user_id, a.created_at FROM public.agent_attribution a JOIN codes c ON c.code = a.ref_code
     WHERE a.event_type = 'signup' AND a.user_id IS NOT NULL ORDER BY a.user_id, a.created_at
  ), pays AS (
    SELECT u.rep, t.user_id, coalesce(t.amount_cents, 0) AS cents FROM users u JOIN public.credit_transactions t ON t.user_id = u.user_id
     WHERE t.type IN ('subscription', 'credit_purchase', 'subscription_renewal', 'play_purchase') AND t.created_at >= _since AND t.created_at < _until
  )
  SELECT r.user_id, r.display_name, r.ref_code, r.commission_rate,
    (SELECT count(*) FROM users u WHERE u.rep = r.user_id AND u.created_at >= _since AND u.created_at < _until),
    (SELECT count(DISTINCT p.user_id) FROM pays p WHERE p.rep = r.user_id),
    (SELECT count(*) FROM pays p WHERE p.rep = r.user_id),
    (SELECT coalesce(sum(p.cents), 0)::bigint FROM pays p WHERE p.rep = r.user_id),
    (SELECT round(coalesce(sum(p.cents), 0) * r.commission_rate / 100)::bigint FROM pays p WHERE p.rep = r.user_id)
  FROM public.sales_reps r ORDER BY r.display_name;
END $$;

-- Cold inbox claim: use the owning rep's name and reply-to when set (the cold inbox stays on reply-to so replies are still recorded).
CREATE OR REPLACE FUNCTION public.agent_claim_approved_emails()
 RETURNS TABLE(id uuid, lead_id uuid, to_email text, to_name text, subject text, body text, ref_code text, from_email text, reply_to text, physical_address text, base_url text, sending_account_id uuid, from_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE s public.agent_settings; r record; acc record; v_name text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE key = 'email_outreach';
  IF s IS NULL OR NOT s.enabled THEN RETURN; END IF;

  UPDATE public.agent_outreach o SET status = 'failed', error = 'Refused: opted-in lead belongs to the SendGrid lane'
    FROM public.agent_leads l
   WHERE l.id = o.lead_id AND o.workflow = 'email_outreach' AND o.status = 'approved' AND l.consent_email;

  FOR r IN
    SELECT o.id AS oid, o.lead_id AS lid, l.email AS em, coalesce(l.name, l.business_name) AS nm,
           o.subject AS subj, coalesce(o.final_text, o.draft_text) AS bod, o.ref_code AS ref, o.reply_to AS rto, o.from_name AS fname
      FROM public.agent_outreach o JOIN public.agent_leads l ON l.id = o.lead_id
     WHERE o.workflow = 'email_outreach' AND o.status = 'approved'
       AND NOT l.do_not_contact AND l.email IS NOT NULL AND l.merged_into IS NULL AND NOT l.consent_email
       AND NOT EXISTS (SELECT 1 FROM public.email_suppressions es WHERE es.email = lower(btrim(l.email)))
       AND (o.scheduled_for IS NULL OR o.scheduled_for <= now())
       AND public.cold_send_window_open(l.state)
     ORDER BY o.scheduled_for NULLS FIRST, o.decided_at NULLS LAST
     LIMIT 100
     FOR UPDATE OF o SKIP LOCKED
  LOOP
    SELECT a.id, a.email, a.display_name INTO acc
      FROM public.sending_accounts a
     WHERE a.provider = 'gmail' AND a.active
       AND public.sending_account_used_today(a.id) < public.sending_account_capacity(a.id)
     ORDER BY a.last_sent_at NULLS FIRST
     LIMIT 1 FOR UPDATE SKIP LOCKED;
    EXIT WHEN acc.id IS NULL;
    UPDATE public.agent_outreach SET status = 'sending', sending_account_id = acc.id, claimed_at = now() WHERE agent_outreach.id = r.oid;
    UPDATE public.sending_accounts SET last_sent_at = now() WHERE sending_accounts.id = acc.id;
    UPDATE public.broadcast_recipients SET status = 'sending' WHERE outreach_id = r.oid;
    v_name := coalesce(r.fname, acc.display_name);
    id := r.oid; lead_id := r.lid; to_email := r.em; to_name := r.nm; subject := r.subj; body := r.bod; ref_code := r.ref;
    from_email := coalesce(v_name || ' <' || acc.email || '>', acc.email);
    reply_to := CASE WHEN r.rto IS NOT NULL AND lower(r.rto) <> lower(acc.email) THEN r.rto || ', ' || acc.email ELSE acc.email END;
    physical_address := s.config->>'physical_address'; base_url := s.config->>'base_url';
    sending_account_id := acc.id; from_name := v_name;
    RETURN NEXT;
    acc := NULL;
  END LOOP;
END $function$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_unassigned(), public.admin_reassign_lead(uuid, uuid), public.admin_invite_rep(text, text, text, text[], integer, numeric),
  public.accept_rep_invite(), public.rep_update_profile(text, text, text, text), public.rep_claim_lead(uuid), public.rep_set_stage(uuid, text),
  public.rep_log_call(uuid, text, text, uuid), public.rep_log_touch(uuid, text, text), public.rep_log_reply(uuid, text, text),
  public.rep_stats(uuid, timestamptz), public.rep_leaderboard(timestamptz), public.rep_commission_report(timestamptz, timestamptz) FROM anon;