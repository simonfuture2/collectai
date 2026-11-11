-- Deliverability: bounce/complaint events, inbox auto-pause, broadcast pause, results report.
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event text NOT NULL,
  email text,
  sending_account_id uuid,
  outreach_id uuid,
  ext_id text UNIQUE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent admins read email events" ON public.email_events FOR SELECT TO authenticated USING (public.is_agent_admin());
CREATE INDEX IF NOT EXISTS email_events_created_idx ON public.email_events (provider, event, created_at);
CREATE INDEX IF NOT EXISTS email_events_acc_idx ON public.email_events (sending_account_id, created_at);

INSERT INTO public.agent_settings (key, enabled, config) VALUES
  ('deliverability', true, '{}'::jsonb),
  ('weekly_summary', true, '{"to":"mycollectaiteam@gmail.com"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.inbox_stats(_acc uuid, _since timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'sends', (SELECT count(*) FROM public.agent_outreach WHERE sending_account_id = _acc AND status IN ('sent','bounced') AND sent_at >= _since),
    'bounces', (SELECT count(*) FROM public.email_events WHERE sending_account_id = _acc AND event = 'bounce' AND created_at >= _since),
    'complaints', (SELECT count(*) FROM public.email_events WHERE sending_account_id = _acc AND event = 'complaint' AND created_at >= _since),
    'replies', (SELECT count(DISTINCT r.id) FROM public.agent_replies r
                 WHERE r.received_at >= _since AND coalesce(r.intent,'') <> 'auto_reply'
                   AND EXISTS (SELECT 1 FROM public.agent_outreach o WHERE o.lead_id = r.lead_id AND o.sending_account_id = _acc AND o.sent_at <= r.received_at)))
$$;
REVOKE EXECUTE ON FUNCTION public.inbox_stats(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Mirror of inboxPauseReason in _shared/deliverability.ts.
CREATE OR REPLACE FUNCTION public.deliverability_enforce_inbox(_acc uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s jsonb; v_sends int; v_b int; v_c int; v_reason text;
BEGIN
  IF _acc IS NULL THEN RETURN NULL; END IF;
  s := public.inbox_stats(_acc, now() - interval '7 days');
  v_sends := (s->>'sends')::int; v_b := (s->>'bounces')::int; v_c := (s->>'complaints')::int;
  IF v_c > 0 THEN v_reason := format('Spam complaint received (%s in 7 days)', v_c);
  ELSIF v_sends > 0 AND v_b::numeric / v_sends > 0.03 THEN
    v_reason := format('Bounce rate %s%% is above 3%% (%s of %s in 7 days)', round(100.0 * v_b / v_sends, 1), v_b, v_sends);
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.sending_accounts SET active = false, paused_reason = 'Auto-paused: ' || v_reason WHERE id = _acc AND active;
  END IF;
  RETURN v_reason;
END $$;
REVOKE EXECUTE ON FUNCTION public.deliverability_enforce_inbox(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_record_bounce(p_email text, p_kind text DEFAULT 'bounce', p_outreach_id uuid DEFAULT NULL, p_reason text DEFAULT NULL, p_message_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := lower(btrim(p_email)); v_o record; v_paused text; v_kind text := CASE WHEN p_kind = 'complaint' THEN 'complaint' ELSE 'bounce' END;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'no email'); END IF;
  IF p_message_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.email_events WHERE ext_id = 'gmail:' || p_message_id) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  SELECT o.id, o.sending_account_id INTO v_o FROM public.agent_outreach o
   LEFT JOIN public.agent_leads l ON l.id = o.lead_id
   WHERE (p_outreach_id IS NOT NULL AND o.id = p_outreach_id)
      OR (p_outreach_id IS NULL AND lower(l.email) = v_email AND o.channel = 'email' AND o.status IN ('sent','bounced') AND o.sent_at > now() - interval '30 days')
   ORDER BY o.sent_at DESC NULLS LAST LIMIT 1;
  INSERT INTO public.email_events (provider, event, email, sending_account_id, outreach_id, ext_id, reason)
  VALUES ('gmail', v_kind, v_email, v_o.sending_account_id, v_o.id, CASE WHEN p_message_id IS NULL THEN NULL ELSE 'gmail:' || p_message_id END, left(p_reason, 500));
  IF v_o.id IS NOT NULL AND v_kind = 'bounce' THEN
    UPDATE public.agent_outreach SET status = 'bounced', error = left(coalesce(p_reason, 'bounced'), 500) WHERE id = v_o.id AND status = 'sent';
    UPDATE public.broadcast_recipients SET status = 'bounced' WHERE outreach_id = v_o.id;
  END IF;
  PERFORM public.suppress_email(v_email, CASE WHEN v_kind = 'complaint' THEN 'complaint' ELSE 'bounced' END, 'gmail_' || v_kind);
  v_paused := public.deliverability_enforce_inbox(v_o.sending_account_id);
  RETURN jsonb_build_object('ok', true, 'outreach_id', v_o.id, 'sending_account_id', v_o.sending_account_id, 'inbox_paused', v_paused);
END $$;
REVOKE EXECUTE ON FUNCTION public.agent_record_bounce(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inbox_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_agent_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'email', a.email, 'provider', a.provider, 'domain', coalesce(a.domain, split_part(a.email, '@', 2)),
     'active', a.active, 'paused_reason', a.paused_reason) || public.inbox_stats(a.id, now() - interval '7 days') ORDER BY a.created_at)
    FROM public.sending_accounts a), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.deliverability_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c jsonb;
BEGIN
  IF NOT (public.is_agent_admin() OR public.is_admin()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT config INTO c FROM public.agent_settings WHERE key = 'deliverability';
  RETURN jsonb_build_object(
    'paused_inboxes', coalesce((SELECT jsonb_agg(jsonb_build_object('email', email, 'reason', paused_reason)) FROM public.sending_accounts WHERE NOT active AND paused_reason LIKE 'Auto-paused:%'), '[]'::jsonb),
    'broadcasts_paused_at', c->>'broadcasts_paused_at', 'broadcasts_paused_reason', c->>'broadcasts_paused_reason',
    'sendgrid_30d', jsonb_build_object(
      'delivered', (SELECT count(*) FROM public.email_events WHERE provider = 'sendgrid' AND event = 'delivered' AND created_at > now() - interval '30 days'),
      'spam', (SELECT count(*) FROM public.email_events WHERE provider = 'sendgrid' AND event = 'complaint' AND created_at > now() - interval '30 days'),
      'bounces', (SELECT count(*) FROM public.email_events WHERE provider = 'sendgrid' AND event = 'bounce' AND created_at > now() - interval '30 days'),
      'unsubscribes', (SELECT count(*) FROM public.email_events WHERE provider = 'sendgrid' AND event = 'unsubscribe' AND created_at > now() - interval '30 days')));
END $$;

CREATE OR REPLACE FUNCTION public.deliverability_resume_broadcasts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_agent_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.agent_settings SET config = config - 'broadcasts_paused_at' - 'broadcasts_paused_reason', updated_at = now() WHERE key = 'deliverability';
END $$;

-- Results report for one window. Sequence outcomes count people the sequence emailed in the window and where they are now.
CREATE OR REPLACE FUNCTION public.results_report(_since timestamptz, _until timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.is_agent_admin() OR public.is_lead_admin()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  WITH sent AS (
    SELECT o.id, o.lead_id, o.step_id, o.enrollment_id, o.sent_at, st.sequence_id
      FROM public.agent_outreach o JOIN public.agent_sequence_steps st ON st.id = o.step_id
     WHERE o.status IN ('sent','bounced') AND o.sent_at >= _since AND o.sent_at < _until
  ), rep AS (
    SELECT s.*, (SELECT r.intent FROM public.agent_replies r WHERE r.lead_id = s.lead_id AND r.received_at >= s.sent_at AND coalesce(r.intent,'') <> 'auto_reply'
       AND NOT EXISTS (SELECT 1 FROM public.agent_outreach o2 WHERE o2.enrollment_id = s.enrollment_id AND o2.status = 'sent' AND o2.sent_at > s.sent_at AND o2.sent_at < r.received_at)
       ORDER BY r.received_at LIMIT 1) AS intent,
      EXISTS (SELECT 1 FROM public.agent_replies r WHERE r.lead_id = s.lead_id AND r.received_at >= s.sent_at AND coalesce(r.intent,'') <> 'auto_reply'
       AND NOT EXISTS (SELECT 1 FROM public.agent_outreach o2 WHERE o2.enrollment_id = s.enrollment_id AND o2.status = 'sent' AND o2.sent_at > s.sent_at AND o2.sent_at < r.received_at)) AS replied
      FROM sent s
  ), su AS (
    SELECT DISTINCT ON (a.user_id) s.id AS shop, a.user_id, a.created_at FROM public.agent_attribution a
      JOIN public.partner_shops s ON s.partner_code = a.ref_code
     WHERE a.event_type = 'signup' AND a.user_id IS NOT NULL ORDER BY a.user_id, a.created_at
  ), lead_out AS (
    SELECT l.id, l.stage, l.user_id,
      (l.stage IN ('meeting_booked','partner_onboarding','active_partner') OR EXISTS (SELECT 1 FROM public.agent_activities a WHERE a.lead_id = l.id AND a.type = 'meeting_booked')) AS meeting,
      l.stage = 'active_partner' AS partner, (l.stage = 'signed_up' OR l.user_id IS NOT NULL) AS signup
    FROM public.agent_leads l
  )
  SELECT jsonb_build_object(
    'sequences', coalesce((SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
      SELECT jsonb_build_object('id', q.id, 'name', q.name, 'lane', q.lane,
        'sent', (SELECT count(*) FROM rep WHERE rep.sequence_id = q.id),
        'people', (SELECT count(DISTINCT lead_id) FROM rep WHERE rep.sequence_id = q.id),
        'replied', (SELECT count(DISTINCT lead_id) FROM rep WHERE rep.sequence_id = q.id AND replied),
        'interested', (SELECT count(DISTINCT lead_id) FROM rep WHERE rep.sequence_id = q.id AND intent = 'interested'),
        'meetings', (SELECT count(*) FROM lead_out lo WHERE lo.meeting AND lo.id IN (SELECT lead_id FROM rep WHERE rep.sequence_id = q.id)),
        'partners', (SELECT count(*) FROM lead_out lo WHERE lo.partner AND lo.id IN (SELECT lead_id FROM rep WHERE rep.sequence_id = q.id)),
        'signups', (SELECT count(*) FROM lead_out lo WHERE lo.signup AND lo.id IN (SELECT lead_id FROM rep WHERE rep.sequence_id = q.id)),
        'steps', coalesce((SELECT jsonb_agg(jsonb_build_object('step_no', st.step_no, 'channel', st.channel,
            'sent', (SELECT count(*) FROM rep WHERE rep.step_id = st.id),
            'replied', (SELECT count(*) FROM rep WHERE rep.step_id = st.id AND replied),
            'interested', (SELECT count(*) FROM rep WHERE rep.step_id = st.id AND intent = 'interested')) ORDER BY st.step_no)
          FROM public.agent_sequence_steps st WHERE st.sequence_id = q.id), '[]'::jsonb)) AS x
      FROM public.agent_sequences q) z), '[]'::jsonb),
    'by_type', coalesce((SELECT jsonb_agg(t) FROM (
      SELECT l.lead_type AS key, count(*) AS leads, count(*) FILTER (WHERE l.last_contacted_at IS NOT NULL) AS contacted,
        count(*) FILTER (WHERE l.replied_at IS NOT NULL) AS replied, count(*) FILTER (WHERE lo.meeting) AS meetings,
        count(*) FILTER (WHERE lo.partner) AS partners, count(*) FILTER (WHERE lo.signup) AS signups
      FROM public.agent_leads l JOIN lead_out lo ON lo.id = l.id
      WHERE l.merged_into IS NULL AND l.created_at >= _since AND l.created_at < _until GROUP BY 1) t), '[]'::jsonb),
    'by_source', coalesce((SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN l.source ILIKE 'places%' OR l.place_id IS NOT NULL THEN 'places' WHEN l.source = 'partner_form' THEN 'partner_form'
                  WHEN l.source = 'lead_magnet' THEN 'lead_magnet' WHEN l.event_id IS NOT NULL OR l.source ILIKE 'event%' THEN 'event'
                  WHEN l.source ILIKE '%csv%' OR l.source ILIKE 'import%' THEN 'csv' ELSE coalesce(l.source, 'other') END AS key,
        count(*) AS leads, count(*) FILTER (WHERE l.last_contacted_at IS NOT NULL) AS contacted,
        count(*) FILTER (WHERE l.replied_at IS NOT NULL) AS replied, count(*) FILTER (WHERE lo.meeting) AS meetings,
        count(*) FILTER (WHERE lo.partner) AS partners, count(*) FILTER (WHERE lo.signup) AS signups
      FROM public.agent_leads l JOIN lead_out lo ON lo.id = l.id
      WHERE l.merged_into IS NULL AND l.created_at >= _since AND l.created_at < _until GROUP BY 1) t), '[]'::jsonb),
    'shops', coalesce((SELECT jsonb_agg(jsonb_build_object('name', sh.name, 'status', sh.status,
        'signups', (SELECT count(*) FROM su WHERE su.shop = sh.id AND su.created_at >= _since AND su.created_at < _until),
        'signups_total', (SELECT count(*) FROM su WHERE su.shop = sh.id),
        'conversions', (SELECT count(*) FROM su JOIN public.credit_transactions t ON t.user_id = su.user_id
           WHERE su.shop = sh.id AND t.type IN ('subscription','credit_purchase','subscription_renewal','play_purchase')
             AND t.created_at >= _since AND t.created_at < _until AND t.created_at < su.created_at + interval '12 months')) ORDER BY sh.name)
       FROM public.partner_shops sh), '[]'::jsonb),
    'active_shops', (SELECT count(*) FROM public.partner_shops WHERE status = 'active'),
    'partners_activated', coalesce((SELECT jsonb_agg(name) FROM public.partner_shops WHERE joined_at >= _since AND joined_at < _until), '[]'::jsonb),
    'reps', coalesce((SELECT jsonb_agg(jsonb_build_object('name', r.display_name,
        'touches', (SELECT count(*) FROM public.agent_outreach o JOIN public.agent_leads l ON l.id = o.lead_id WHERE l.owner_id = r.user_id AND o.channel = 'email' AND o.status = 'sent' AND o.sent_at >= _since AND o.sent_at < _until)
                 + (SELECT count(*) FROM public.agent_activities WHERE rep_id = r.user_id AND type IN ('call','dm') AND created_at >= _since AND created_at < _until),
        'replies', (SELECT count(*) FROM public.agent_replies x JOIN public.agent_leads l ON l.id = x.lead_id WHERE l.owner_id = r.user_id AND x.received_at >= _since AND x.received_at < _until AND coalesce(x.intent,'') <> 'auto_reply'),
        'meetings', (SELECT count(*) FROM public.agent_activities WHERE rep_id = r.user_id AND type = 'meeting_booked' AND created_at >= _since AND created_at < _until),
        'partners', (SELECT count(*) FROM public.agent_activities WHERE rep_id = r.user_id AND type = 'stage_change' AND meta->>'to' = 'active_partner' AND created_at >= _since AND created_at < _until),
        'signups', (SELECT count(DISTINCT a.user_id) FROM public.agent_attribution a WHERE a.event_type = 'signup' AND a.created_at >= _since AND a.created_at < _until
                     AND (a.ref_code = r.ref_code OR a.ref_code IN (SELECT partner_code FROM public.agent_leads WHERE owner_id = r.user_id AND partner_code IS NOT NULL))))
       ORDER BY r.display_name) FROM public.sales_reps r), '[]'::jsonb),
    'totals', jsonb_build_object(
      'sent', (SELECT count(*) FROM public.agent_outreach WHERE channel = 'email' AND status IN ('sent','bounced') AND sent_at >= _since AND sent_at < _until)
            + (SELECT count(*) FROM public.broadcast_recipients WHERE lane = 'opted_in' AND status = 'sent' AND sent_at >= _since AND sent_at < _until),
      'replies', (SELECT count(*) FROM public.agent_replies WHERE received_at >= _since AND received_at < _until AND coalesce(intent,'') <> 'auto_reply'),
      'interested', (SELECT count(*) FROM public.agent_replies WHERE received_at >= _since AND received_at < _until AND intent = 'interested'),
      'meetings', (SELECT count(*) FROM public.agent_activities WHERE type = 'meeting_booked' AND created_at >= _since AND created_at < _until),
      'new_leads', (SELECT count(*) FROM public.agent_leads WHERE merged_into IS NULL AND created_at >= _since AND created_at < _until),
      'signups', (SELECT count(DISTINCT user_id) FROM public.agent_attribution WHERE event_type = 'signup' AND created_at >= _since AND created_at < _until),
      'bounces', (SELECT count(*) FROM public.email_events WHERE event = 'bounce' AND created_at >= _since AND created_at < _until),
      'complaints', (SELECT count(*) FROM public.email_events WHERE event = 'complaint' AND created_at >= _since AND created_at < _until))
  ) INTO v FROM (SELECT 1) one;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.results_report(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.results_report(timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inbox_stats(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.deliverability_enforce_inbox(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_record_bounce(text, text, uuid, text, text) TO service_role;