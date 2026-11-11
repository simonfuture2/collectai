CREATE TABLE public.agent_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  name text NOT NULL,
  lane text NOT NULL CHECK (lane IN ('cold','opted_in')),
  lead_type text,
  active boolean NOT NULL DEFAULT true,
  auto_approve boolean NOT NULL DEFAULT false,
  approved_unedited integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.agent_sequences(id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  day_offset integer NOT NULL DEFAULT 0,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','call_task','dm_task')),
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  angle text,
  include_link boolean NOT NULL DEFAULT false,
  include_video boolean NOT NULL DEFAULT false,
  require_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_no)
);
CREATE TABLE public.agent_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.agent_leads(id) ON DELETE CASCADE,
  user_id uuid,
  sequence_id uuid NOT NULL REFERENCES public.agent_sequences(id) ON DELETE CASCADE,
  rep_id uuid,
  current_step integer NOT NULL DEFAULT 1,
  next_due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped_reply','stopped_unsub','stopped_signup','completed')),
  stop_reason text,
  last_email_at timestamptz,
  clock_minutes integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  CHECK (lead_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE UNIQUE INDEX agent_enrollments_one_active_lead ON public.agent_enrollments(lead_id) WHERE status IN ('active','paused') AND lead_id IS NOT NULL;
CREATE UNIQUE INDEX agent_enrollments_one_active_user ON public.agent_enrollments(user_id) WHERE status IN ('active','paused') AND user_id IS NOT NULL;
CREATE INDEX agent_enrollments_due ON public.agent_enrollments(next_due_at) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_sequences, public.agent_sequence_steps, public.agent_enrollments TO authenticated;
GRANT ALL ON public.agent_sequences, public.agent_sequence_steps, public.agent_enrollments TO service_role;
ALTER TABLE public.agent_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage sequences" ON public.agent_sequences FOR ALL TO authenticated USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));
CREATE POLICY "admins manage sequence steps" ON public.agent_sequence_steps FOR ALL TO authenticated USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));
CREATE POLICY "admins manage enrollments" ON public.agent_enrollments FOR ALL TO authenticated USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));

ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES public.agent_enrollments(id) ON DELETE SET NULL;
ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS step_id uuid REFERENCES public.agent_sequence_steps(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_outreach_one_per_step ON public.agent_outreach(enrollment_id, step_id) WHERE enrollment_id IS NOT NULL AND step_id IS NOT NULL;

-- Length of one sequence "day" (test enrollments use minutes).
CREATE OR REPLACE FUNCTION public.seq_unit(_clock_minutes integer) RETURNS interval LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE WHEN _clock_minutes IS NULL THEN interval '1 day' ELSE make_interval(mins => _clock_minutes) END $$;

CREATE OR REPLACE FUNCTION public.agent_stop_enrollment(p_enrollment_id uuid DEFAULT NULL, p_lead_id uuid DEFAULT NULL, p_status text DEFAULT 'stopped_reply', p_reason text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[];
BEGIN
  IF p_status NOT IN ('paused','stopped_reply','stopped_unsub','stopped_signup','completed') THEN RAISE EXCEPTION 'bad status %', p_status; END IF;
  WITH u AS (
    UPDATE public.agent_enrollments SET status = p_status, stop_reason = coalesce(p_reason, stop_reason),
           stopped_at = CASE WHEN p_status = 'paused' THEN NULL ELSE now() END
     WHERE status IN ('active','paused')
       AND ((p_enrollment_id IS NOT NULL AND id = p_enrollment_id)
         OR (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
         OR (p_user_id IS NOT NULL AND user_id = p_user_id))
    RETURNING id
  ) SELECT array_agg(id) INTO v_ids FROM u;
  IF v_ids IS NOT NULL AND p_status <> 'paused' THEN
    UPDATE public.agent_outreach SET status = 'skipped', error = coalesce(p_reason, p_status)
     WHERE enrollment_id = ANY(v_ids) AND status IN ('pending','approved','drafting');
  END IF;
  RETURN jsonb_build_object('ok', true, 'stopped', coalesce(array_length(v_ids, 1), 0));
END $$;

CREATE OR REPLACE FUNCTION public.agent_advance_enrollment(p_enrollment_id uuid, p_from_step integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.agent_enrollments; nxt public.agent_sequence_steps; first_off integer;
BEGIN
  SELECT * INTO e FROM public.agent_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF e IS NULL OR e.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not active'); END IF;
  IF p_from_step IS NOT NULL AND p_from_step <> e.current_step THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  SELECT * INTO nxt FROM public.agent_sequence_steps WHERE sequence_id = e.sequence_id AND step_no > e.current_step ORDER BY step_no LIMIT 1;
  IF nxt IS NULL THEN
    UPDATE public.agent_enrollments SET status = 'completed', stopped_at = now() WHERE id = e.id;
    RETURN jsonb_build_object('ok', true, 'completed', true);
  END IF;
  SELECT min(day_offset) INTO first_off FROM public.agent_sequence_steps WHERE sequence_id = e.sequence_id;
  UPDATE public.agent_enrollments
     SET current_step = nxt.step_no,
         next_due_at = greatest(e.started_at + (nxt.day_offset - first_off) * public.seq_unit(e.clock_minutes), now())
   WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'step', nxt.step_no);
END $$;

CREATE OR REPLACE FUNCTION public.agent_start_enrollment(p_sequence_id uuid, p_lead_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_start_at timestamptz DEFAULT now(), p_rep_id uuid DEFAULT NULL, p_clock_minutes integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_first integer; v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT (public.is_agent_admin() OR public.is_admin(auth.uid())) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT min(step_no) INTO v_first FROM public.agent_sequence_steps WHERE sequence_id = p_sequence_id;
  IF v_first IS NULL THEN RAISE EXCEPTION 'sequence has no steps'; END IF;
  INSERT INTO public.agent_enrollments (lead_id, user_id, sequence_id, rep_id, current_step, next_due_at, started_at, clock_minutes)
  VALUES (p_lead_id, p_user_id, p_sequence_id, coalesce(p_rep_id, auth.uid()), v_first, p_start_at, p_start_at, p_clock_minutes)
  RETURNING id INTO v_id;
  IF p_lead_id IS NOT NULL THEN
    UPDATE public.agent_leads SET stage = 'in_sequence' WHERE id = p_lead_id AND stage IN ('new','researched');
    INSERT INTO public.agent_activities (lead_id, rep_id, type, body, meta)
    SELECT p_lead_id, auth.uid(), 'sequence_started', s.name, jsonb_build_object('enrollment_id', v_id) FROM public.agent_sequences s WHERE s.id = p_sequence_id;
  END IF;
  RETURN v_id;
END $$;

-- AI-written steps waiting for a draft. Creates a 'drafting' outreach row per step and returns the context n8n needs.
CREATE OR REPLACE FUNCTION public.agent_next_steps_to_draft(p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_out jsonb := '[]'::jsonb; v_oid uuid; v_cfg jsonb; v_links jsonb; v_rules jsonb; v_first integer; v_hist jsonb;
BEGIN
  SELECT config INTO v_cfg FROM public.agent_settings WHERE key = 'email_outreach';
  SELECT config INTO v_links FROM public.agent_settings WHERE key = 'sequence_links';
  SELECT config INTO v_rules FROM public.agent_settings WHERE key = 'writing_rules';
  FOR r IN
    SELECT e.id eid, e.lead_id, e.current_step, st.id sid, st.angle, st.include_link, st.include_video, st.step_no,
           s.id seq_id, s.name seq_name, s.lane, to_jsonb(l) - 'notes' AS lead, l.notes, l.email
      FROM public.agent_enrollments e
      JOIN public.agent_sequences s ON s.id = e.sequence_id AND s.active
      JOIN public.agent_sequence_steps st ON st.sequence_id = e.sequence_id AND st.step_no = e.current_step
      JOIN public.agent_leads l ON l.id = e.lead_id
     WHERE e.status = 'active' AND e.next_due_at <= now() AND st.channel = 'email' AND st.template_id IS NULL
       AND (e.last_email_at IS NULL OR e.last_email_at + 2 * public.seq_unit(e.clock_minutes) <= now())
       AND NOT EXISTS (SELECT 1 FROM public.email_suppressions es WHERE es.email = lower(btrim(l.email)))
       AND NOT EXISTS (SELECT 1 FROM public.agent_outreach o WHERE o.enrollment_id = e.id AND o.step_id = st.id)
     ORDER BY e.next_due_at LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
  LOOP
    SELECT min(step_no) INTO v_first FROM public.agent_sequence_steps WHERE sequence_id = r.seq_id;
    INSERT INTO public.agent_outreach (lead_id, workflow, channel, status, enrollment_id, step_id, ref_code)
    VALUES (r.lead_id, CASE WHEN r.lane = 'cold' THEN 'email_outreach' ELSE 'sequence_optin' END, 'email', 'drafting', r.eid, r.sid, 'seq_' || left(r.seq_id::text, 8))
    RETURNING id INTO v_oid;
    SELECT coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'kind', x.kind, 'subject', x.subject, 'text', x.txt) ORDER BY x.at), '[]'::jsonb) INTO v_hist FROM (
      SELECT o.sent_at at, 'sent' kind, o.subject, coalesce(o.final_text, o.draft_text) txt FROM public.agent_outreach o WHERE o.lead_id = r.lead_id AND o.status = 'sent'
      UNION ALL SELECT rp.received_at, 'reply', rp.subject, left(rp.body, 1500) FROM public.agent_replies rp WHERE rp.lead_id = r.lead_id
    ) x;
    v_out := v_out || jsonb_build_object(
      'outreach_id', v_oid, 'enrollment_id', r.eid, 'step_id', r.sid, 'step_no', r.step_no, 'is_first_step', r.step_no = v_first,
      'sequence', r.seq_name, 'lane', r.lane, 'angle', r.angle, 'include_link', r.include_link, 'include_video', r.include_video,
      'lead', r.lead, 'lead_notes', r.notes, 'history', v_hist,
      'rep_signature', coalesce(v_links->>'rep_signature', v_cfg->>'rep_name', 'Simon'),
      'booking_link', v_links->>'booking_url', 'video_links', coalesce(v_links->'video_urls', '[]'::jsonb),
      'mailing_address', v_cfg->>'physical_address',
      'ref_link', coalesce(v_cfg->>'base_url', 'https://mycollectai.com') || '/?ref=seq_' || left(r.seq_id::text, 8),
      'writing_rules', v_rules);
  END LOOP;
  RETURN v_out;
END $$;

-- Drafts from sequences: auto-approve when the step or sequence allows it and the link rule holds.
CREATE OR REPLACE FUNCTION public.agent_attach_draft(p_id uuid, p_draft text, p_subject text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.agent_outreach; st public.agent_sequence_steps; s public.agent_sequences; v_first integer; v_links integer; v_auto boolean := false; v_problem text;
BEGIN
  SELECT * INTO o FROM public.agent_outreach WHERE id = p_id;
  IF o.step_id IS NOT NULL THEN
    SELECT * INTO st FROM public.agent_sequence_steps WHERE id = o.step_id;
    SELECT * INTO s FROM public.agent_sequences WHERE id = st.sequence_id;
    SELECT min(step_no) INTO v_first FROM public.agent_sequence_steps WHERE sequence_id = st.sequence_id;
    v_links := (SELECT count(*) FROM regexp_matches(coalesce(p_draft, ''), 'https?://', 'gi'));
    IF s.lane = 'cold' AND st.step_no = v_first AND (v_links > 0 OR p_draft ~* '<img') THEN v_problem := 'First cold email must have no links or images';
    ELSIF v_links > 1 THEN v_problem := 'At most one link per email';
    END IF;
    v_auto := v_problem IS NULL AND (NOT st.require_approval OR (s.auto_approve AND s.approved_unedited >= 20 AND st.step_no > v_first));
  END IF;
  UPDATE public.agent_outreach
     SET draft_text = p_draft, final_text = p_draft, subject = coalesce(p_subject, subject),
         status = CASE WHEN v_auto THEN 'approved' ELSE 'pending' END,
         decided_at = CASE WHEN v_auto THEN now() ELSE decided_at END, error = v_problem
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'auto_approved', v_auto, 'problem', v_problem);
END $$;

-- The old one-email-per-lead flow is replaced by sequences.
CREATE OR REPLACE FUNCTION public.agent_next_leads_to_draft(p_limit integer DEFAULT 10)
RETURNS SETOF public.agent_leads LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.agent_leads WHERE false $$;
COMMENT ON FUNCTION public.agent_next_leads_to_draft(integer) IS 'DEPRECATED: replaced by agent_next_steps_to_draft (sequences). Returns nothing.';

-- Outreach status changes drive enrollments.
CREATE OR REPLACE FUNCTION public.seq_on_outreach_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_step integer;
BEGIN
  IF NEW.enrollment_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT step_no INTO v_step FROM public.agent_sequence_steps WHERE id = NEW.step_id;
  IF NEW.status = 'approved' AND OLD.status = 'pending' AND NEW.step_id IS NOT NULL
     AND coalesce(NEW.final_text, '') = coalesce(NEW.draft_text, '') THEN
    UPDATE public.agent_sequences s SET approved_unedited = approved_unedited + 1
      FROM public.agent_sequence_steps st WHERE st.id = NEW.step_id AND s.id = st.sequence_id;
  END IF;
  IF NEW.status = 'sent' THEN
    UPDATE public.agent_enrollments SET last_email_at = now() WHERE id = NEW.enrollment_id AND NEW.channel = 'email';
    PERFORM public.agent_advance_enrollment(NEW.enrollment_id, v_step);
  ELSIF NEW.status = 'done' THEN
    PERFORM public.agent_advance_enrollment(NEW.enrollment_id, v_step);
  ELSIF NEW.status = 'bounced' THEN
    PERFORM public.agent_stop_enrollment(NEW.enrollment_id, NULL, 'stopped_unsub', 'bounced');
  ELSIF NEW.status = 'rejected' AND v_step IS NOT NULL THEN
    PERFORM public.agent_advance_enrollment(NEW.enrollment_id, v_step);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER seq_on_outreach_status AFTER UPDATE OF status ON public.agent_outreach FOR EACH ROW EXECUTE FUNCTION public.seq_on_outreach_status();

-- Replies stop sequences; interested replies get a ready booking reply in the Inbox.
CREATE OR REPLACE FUNCTION public.seq_on_reply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.agent_leads; v_links jsonb; v_cfg jsonb; v_name text;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.intent = 'auto_reply' THEN RETURN NEW; END IF;
  PERFORM public.agent_stop_enrollment(NULL, NEW.lead_id, CASE WHEN NEW.intent = 'remove_me' THEN 'stopped_unsub' ELSE 'stopped_reply' END, 'reply: ' || coalesce(NEW.intent, 'other'));
  IF NEW.intent = 'interested' THEN
    SELECT * INTO l FROM public.agent_leads WHERE id = NEW.lead_id;
    SELECT config INTO v_links FROM public.agent_settings WHERE key = 'sequence_links';
    SELECT config INTO v_cfg FROM public.agent_settings WHERE key = 'email_outreach';
    v_name := coalesce(nullif(split_part(btrim(coalesce(l.name, '')), ' ', 1), ''), 'there');
    INSERT INTO public.agent_outreach (lead_id, workflow, channel, status, subject, draft_text, final_text, ref_code, source_text)
    VALUES (NEW.lead_id, CASE WHEN l.consent_email THEN 'sequence_optin' ELSE 'email_outreach' END, 'email', 'pending',
      'Re: ' || coalesce(NEW.subject, 'MyCollectAI'),
      'Hi ' || v_name || E',\n\nGreat to hear back. Happy to put together the free price-check snapshot of 5 of your cards and walk you through it.\n\nGrab any time that suits you here: ' || coalesce(v_links->>'booking_url', '') || E'\n\nOr just reply with a good time and I''ll send an invite.\n\n' || coalesce(v_links->>'rep_signature', 'Simon'),
      'Hi ' || v_name || E',\n\nGreat to hear back. Happy to put together the free price-check snapshot of 5 of your cards and walk you through it.\n\nGrab any time that suits you here: ' || coalesce(v_links->>'booking_url', '') || E'\n\nOr just reply with a good time and I''ll send an invite.\n\n' || coalesce(v_links->>'rep_signature', 'Simon'),
      'booking_reply', left(coalesce(NEW.summary, NEW.body), 500));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seq_on_reply failed: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER seq_on_reply AFTER INSERT ON public.agent_replies FOR EACH ROW EXECUTE FUNCTION public.seq_on_reply();

CREATE OR REPLACE FUNCTION public.seq_on_lead_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.do_not_contact AND NOT OLD.do_not_contact) OR (NEW.unsubscribed_at IS NOT NULL AND OLD.unsubscribed_at IS NULL)
     OR (NEW.stage = 'do_not_contact' AND OLD.stage IS DISTINCT FROM 'do_not_contact') THEN
    PERFORM public.agent_stop_enrollment(NULL, NEW.id, 'stopped_unsub', 'do not contact');
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN ('meeting_booked','not_interested') THEN
    PERFORM public.agent_stop_enrollment(NULL, NEW.id, 'stopped_reply', 'stage: ' || NEW.stage);
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage = 'signed_up' THEN
    PERFORM public.agent_stop_enrollment(NULL, NEW.id, 'stopped_signup', 'signed up');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER seq_on_lead_change AFTER UPDATE OF stage, do_not_contact, unsubscribed_at ON public.agent_leads FOR EACH ROW EXECUTE FUNCTION public.seq_on_lead_change();

CREATE OR REPLACE FUNCTION public.seq_on_suppression() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.agent_leads WHERE lower(btrim(email)) = NEW.email LOOP
    PERFORM public.agent_stop_enrollment(NULL, r.id, 'stopped_unsub', NEW.reason);
  END LOOP;
  FOR r IN SELECT id FROM auth.users WHERE lower(email) = NEW.email LOOP
    PERFORM public.agent_stop_enrollment(NULL, NULL, 'stopped_unsub', NEW.reason, r.id);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER seq_on_suppression AFTER INSERT ON public.email_suppressions FOR EACH ROW EXECUTE FUNCTION public.seq_on_suppression();

-- App users who tick marketing emails join the "New users" sequence once; unticking stops it.
CREATE OR REPLACE FUNCTION public.seq_on_marketing_opt_in() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq uuid; v_first integer;
BEGIN
  BEGIN
    IF NEW.marketing_opt_in AND (TG_OP = 'INSERT' OR NOT OLD.marketing_opt_in) THEN
      SELECT id INTO v_seq FROM public.agent_sequences WHERE slug = 'new_users' AND active;
      SELECT min(step_no) INTO v_first FROM public.agent_sequence_steps WHERE sequence_id = v_seq;
      IF v_seq IS NOT NULL AND v_first IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.agent_enrollments WHERE user_id = NEW.id AND (sequence_id = v_seq OR status IN ('active','paused'))) THEN
        INSERT INTO public.agent_enrollments (user_id, sequence_id, current_step, next_due_at) VALUES (NEW.id, v_seq, v_first, now());
      END IF;
    ELSIF TG_OP = 'UPDATE' AND OLD.marketing_opt_in AND NOT NEW.marketing_opt_in THEN
      PERFORM public.agent_stop_enrollment(NULL, NULL, 'stopped_unsub', 'turned off marketing emails', NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'seq_on_marketing_opt_in failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER seq_on_marketing_opt_in AFTER INSERT OR UPDATE OF marketing_opt_in ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.seq_on_marketing_opt_in();

REVOKE EXECUTE ON FUNCTION public.agent_next_steps_to_draft(integer), public.agent_advance_enrollment(uuid, integer), public.agent_stop_enrollment(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_next_steps_to_draft(integer), public.agent_advance_enrollment(uuid, integer), public.agent_stop_enrollment(uuid, uuid, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.agent_start_enrollment(uuid, uuid, uuid, timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_start_enrollment(uuid, uuid, uuid, timestamptz, uuid, integer) TO authenticated, service_role;

COMMENT ON TABLE public.drip_campaign_queue IS 'DEPRECATED: replaced by agent_sequences / agent_enrollments (Lead magnet welcome).';