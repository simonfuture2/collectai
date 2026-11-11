
-- 1. agent_leads: new fields
ALTER TABLE public.agent_leads
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS fit_score int,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS partner_code text,
  ADD COLUMN IF NOT EXISTS consent_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_source text,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into uuid,
  ADD COLUMN IF NOT EXISTS legacy_lead_id uuid;

ALTER TABLE public.agent_leads ADD CONSTRAINT agent_leads_source_check CHECK (source IS NULL OR source IN ('manual','csv','places','partner_form','lead_magnet','instagram','tiktok','reddit','discord','event','referral'));
ALTER TABLE public.agent_leads ADD CONSTRAINT agent_leads_stage_check CHECK (stage IN ('new','researched','in_sequence','replied','meeting_booked','partner_onboarding','active_partner','signed_up','not_interested','do_not_contact'));
COMMENT ON COLUMN public.agent_leads.merged_into IS 'Set when this row is a duplicate of another lead; duplicates are excluded from unique email index and lists';

-- stage <-> status sync
CREATE OR REPLACE FUNCTION public.agent_stage_to_status(_stage text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _stage
    WHEN 'new' THEN 'new' WHEN 'researched' THEN 'new' WHEN 'in_sequence' THEN 'contacted'
    WHEN 'replied' THEN 'replied' WHEN 'meeting_booked' THEN 'replied' WHEN 'partner_onboarding' THEN 'replied'
    WHEN 'active_partner' THEN 'replied' WHEN 'signed_up' THEN 'signed_up'
    WHEN 'not_interested' THEN 'not_interested' WHEN 'do_not_contact' THEN 'do_not_contact' ELSE 'new' END $$;
CREATE OR REPLACE FUNCTION public.agent_status_to_stage(_status text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _status
    WHEN 'new' THEN 'new' WHEN 'drafting' THEN 'researched' WHEN 'queued' THEN 'researched'
    WHEN 'contacted' THEN 'in_sequence' WHEN 'replied' THEN 'replied' WHEN 'signed_up' THEN 'signed_up'
    WHEN 'not_interested' THEN 'not_interested' WHEN 'do_not_contact' THEN 'do_not_contact' ELSE 'new' END $$;

CREATE OR REPLACE FUNCTION public.agent_leads_sync_stage() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage IS DISTINCT FROM 'new' THEN NEW.status := public.agent_stage_to_status(NEW.stage);
    ELSE NEW.stage := public.agent_status_to_stage(NEW.status); END IF;
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.status := public.agent_stage_to_status(NEW.stage);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- keep finer-grained stages when the coarse status still matches
    IF public.agent_stage_to_status(NEW.stage) IS DISTINCT FROM NEW.status THEN
      NEW.stage := public.agent_status_to_stage(NEW.status);
    END IF;
  END IF;
  IF NEW.do_not_contact AND NEW.stage <> 'do_not_contact' AND NEW.stage <> 'signed_up' THEN
    NEW.stage := 'do_not_contact'; NEW.status := 'do_not_contact';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_leads_sync_stage_trg BEFORE INSERT OR UPDATE ON public.agent_leads FOR EACH ROW EXECUTE FUNCTION public.agent_leads_sync_stage();

UPDATE public.agent_leads SET stage = public.agent_status_to_stage(status);

-- mark existing duplicate emails (keep the most recently contacted / newest)
UPDATE public.agent_leads a SET merged_into = k.keep_id
FROM (
  SELECT id, first_value(id) OVER (PARTITION BY lower(email) ORDER BY last_contacted_at DESC NULLS LAST, created_at DESC) AS keep_id
  FROM public.agent_leads WHERE email IS NOT NULL
) k WHERE a.id = k.id AND k.keep_id <> a.id;

CREATE UNIQUE INDEX agent_leads_email_unique ON public.agent_leads (lower(email)) WHERE email IS NOT NULL AND merged_into IS NULL;
CREATE UNIQUE INDEX agent_leads_place_unique ON public.agent_leads (place_id) WHERE place_id IS NOT NULL;

-- 2. activity timeline
CREATE TABLE public.agent_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.agent_leads(id) ON DELETE CASCADE,
  rep_id uuid,
  type text NOT NULL,
  body text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_activities TO authenticated;
GRANT ALL ON public.agent_activities TO service_role;
ALTER TABLE public.agent_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage activities" ON public.agent_activities FOR ALL TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));
CREATE INDEX agent_activities_lead_idx ON public.agent_activities (lead_id, created_at DESC);

-- 3. copy old leads (same id when new; map to existing when email already present)
INSERT INTO public.agent_leads (id, platform, lead_type, name, email, business_name, phone, notes, partner_code, source,
  status, created_at, consent_email, consent_source, legacy_lead_id)
SELECT DISTINCT ON (lower(l.email)) l.id, 'email', CASE WHEN l.company IS NOT NULL THEN 'card_shop' ELSE 'collector' END,
  l.name, lower(l.email), l.company, l.phone, l.notes, l.partner_code,
  CASE l.source::text WHEN 'form' THEN 'partner_form' WHEN 'lead_magnet' THEN 'lead_magnet' WHEN 'csv' THEN 'csv' ELSE 'manual' END,
  CASE l.status::text WHEN 'contacted' THEN 'contacted' WHEN 'interested' THEN 'replied' WHEN 'converted' THEN 'signed_up' WHEN 'lost' THEN 'not_interested' ELSE 'new' END,
  l.created_at,
  l.source::text IN ('form','lead_magnet'),
  CASE l.source::text WHEN 'form' THEN 'partner_form' WHEN 'lead_magnet' THEN 'lead_magnet' END,
  l.id
FROM public.leads l
WHERE l.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.agent_leads a WHERE lower(a.email) = lower(l.email))
ORDER BY lower(l.email), l.created_at;

-- legacy id -> agent lead id map
CREATE TABLE public.legacy_lead_map (legacy_id uuid PRIMARY KEY, agent_lead_id uuid NOT NULL REFERENCES public.agent_leads(id) ON DELETE CASCADE);
GRANT SELECT ON public.legacy_lead_map TO authenticated;
GRANT ALL ON public.legacy_lead_map TO service_role;
ALTER TABLE public.legacy_lead_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read map" ON public.legacy_lead_map FOR SELECT TO authenticated USING (public.is_agent_admin() OR public.is_admin(auth.uid()));
INSERT INTO public.legacy_lead_map (legacy_id, agent_lead_id)
SELECT l.id, (SELECT a.id FROM public.agent_leads a WHERE lower(a.email) = lower(l.email) AND a.merged_into IS NULL ORDER BY (a.id = l.id) DESC, a.created_at LIMIT 1)
FROM public.leads l WHERE l.email IS NOT NULL;

-- consent for existing matches that came from forms
UPDATE public.agent_leads a SET consent_email = true, consent_source = coalesce(a.consent_source, CASE l.source::text WHEN 'form' THEN 'partner_form' ELSE 'lead_magnet' END)
FROM public.legacy_lead_map m JOIN public.leads l ON l.id = m.legacy_id
WHERE a.id = m.agent_lead_id AND l.source::text IN ('form','lead_magnet');

-- activities
INSERT INTO public.agent_activities (lead_id, rep_id, type, body, meta, created_at)
SELECT m.agent_lead_id, la.created_by, la.type::text, la.content, coalesce(la.metadata, '{}'::jsonb) || jsonb_build_object('legacy_activity_id', la.id), la.created_at
FROM public.lead_activities la JOIN public.legacy_lead_map m ON m.legacy_id = la.lead_id;

INSERT INTO public.agent_activities (lead_id, type, body, meta, created_at)
SELECT o.lead_id, 'outreach_' || o.status, coalesce(o.final_text, o.draft_text),
  jsonb_build_object('outreach_id', o.id, 'channel', o.channel, 'workflow', o.workflow, 'subject', o.subject), coalesce(o.sent_at, o.created_at)
FROM public.agent_outreach o WHERE o.lead_id IS NOT NULL;

INSERT INTO public.agent_activities (lead_id, type, body, meta, created_at)
SELECT r.lead_id, 'reply', coalesce(r.summary, left(r.body, 500)), jsonb_build_object('reply_id', r.id, 'intent', r.intent, 'subject', r.subject), r.received_at
FROM public.agent_replies r WHERE r.lead_id IS NOT NULL;

-- 4. drip queue now points at agent_leads
ALTER TABLE public.drip_campaign_queue ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.drip_campaign_queue DROP CONSTRAINT drip_campaign_queue_lead_id_fkey;
UPDATE public.drip_campaign_queue q SET lead_id = m.agent_lead_id FROM public.legacy_lead_map m WHERE q.lead_id = m.legacy_id AND m.agent_lead_id <> q.lead_id;
ALTER TABLE public.drip_campaign_queue ADD CONSTRAINT drip_campaign_queue_agent_lead_fkey FOREIGN KEY (lead_id) REFERENCES public.agent_leads(id) ON DELETE CASCADE NOT VALID;

-- 5. old tables read-only
DROP POLICY IF EXISTS "Admins can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can update leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can insert activities" ON public.lead_activities;
COMMENT ON TABLE public.leads IS 'DEPRECATED: read-only; replaced by agent_leads (see legacy_lead_map)';
COMMENT ON TABLE public.lead_activities IS 'DEPRECATED: read-only; replaced by agent_activities';

-- 6. suppression list
CREATE TABLE public.email_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('unsubscribed','bounced','complained','manual')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_suppressions TO service_role;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage suppressions" ON public.email_suppressions FOR ALL TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));
INSERT INTO public.email_suppressions (email, reason, source, created_at)
SELECT DISTINCT ON (lower(email)) lower(email),
  CASE WHEN reason ILIKE '%bounce%' THEN 'bounced' WHEN reason ILIKE '%complain%' OR reason ILIKE '%spam%' THEN 'complained' WHEN reason ILIKE '%unsub%' THEN 'unsubscribed' ELSE 'manual' END,
  'suppressed_emails', created_at
FROM public.suppressed_emails ORDER BY lower(email), created_at
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.suppress_email(_email text, _reason text, _source text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _email IS NULL OR btrim(_email) = '' THEN RETURN; END IF;
  INSERT INTO public.email_suppressions (email, reason, source) VALUES (lower(btrim(_email)), _reason, _source)
  ON CONFLICT (email) DO NOTHING;
  UPDATE public.agent_leads SET do_not_contact = true, stage = CASE WHEN stage = 'signed_up' THEN stage ELSE 'do_not_contact' END,
    unsubscribed_at = coalesce(unsubscribed_at, now())
  WHERE lower(email) = lower(btrim(_email));
  UPDATE public.agent_outreach o SET status = 'skipped', error = 'suppressed'
  FROM public.agent_leads l WHERE l.id = o.lead_id AND lower(l.email) = lower(btrim(_email)) AND o.status IN ('pending','approved');
  UPDATE public.drip_campaign_queue q SET cancelled_at = now()
  FROM public.agent_leads l WHERE l.id = q.lead_id AND lower(l.email) = lower(btrim(_email)) AND NOT q.sent AND q.cancelled_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.suppress_email(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suppress_email(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.is_email_suppressed(_email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.email_suppressions WHERE email = lower(btrim(_email)));
$$;

-- emails claimed by the agent never go to suppressed addresses
CREATE OR REPLACE FUNCTION public.agent_claim_approved_emails()
 RETURNS TABLE(id uuid, lead_id uuid, to_email text, to_name text, subject text, body text, ref_code text, from_email text, reply_to text, physical_address text, base_url text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare s public.agent_settings; remaining int;
begin
  select * into s from public.agent_settings where key = 'email_outreach';
  if s is null or not s.enabled then return; end if;
  select greatest(coalesce((s.config->>'daily_cap')::int, 25) - count(*), 0) into remaining
    from public.agent_outreach
   where workflow = 'email_outreach' and status = 'sent' and sent_at > now() - interval '24 hours';
  if remaining = 0 then return; end if;
  return query
  with picked as (
    select o.id from public.agent_outreach o
      join public.agent_leads l on l.id = o.lead_id
     where o.workflow = 'email_outreach' and o.status = 'approved'
       and not l.do_not_contact and l.email is not null and l.merged_into is null
       and not exists (select 1 from public.email_suppressions es where es.email = lower(l.email))
     order by o.decided_at nulls last
     limit remaining
     for update of o skip locked
  ), upd as (
    update public.agent_outreach o set status = 'sending' from picked where o.id = picked.id returning o.*
  )
  select upd.id, upd.lead_id, l.email, coalesce(l.name, l.business_name), upd.subject,
         coalesce(upd.final_text, upd.draft_text), upd.ref_code,
         s.config->>'from_email', s.config->>'reply_to', s.config->>'physical_address', s.config->>'base_url'
    from upd join public.agent_leads l on l.id = upd.lead_id;
end $function$;

CREATE OR REPLACE FUNCTION public.agent_next_leads_to_draft(p_limit integer DEFAULT 10)
 RETURNS SETOF agent_leads LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  return query
  update public.agent_leads set status = 'drafting'
   where id in (select a.id from public.agent_leads a
                 where a.platform = 'email' and a.status = 'new' and a.merged_into is null and a.user_id is null
                   and not a.do_not_contact and a.email is not null
                   and not exists (select 1 from public.email_suppressions es where es.email = lower(a.email))
                 order by a.created_at limit p_limit for update skip locked)
  returning *;
end $function$;

-- reply intents that mean "stop emailing me" suppress automatically
CREATE OR REPLACE FUNCTION public.agent_record_reply(p_lead_id uuid, p_message_id text, p_from_email text, p_subject text, p_body text, p_intent text, p_summary text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_intent text := case when p_intent = 'unsubscribe' then 'remove_me'
                              when p_intent in ('interested','question','not_interested','remove_me','auto_reply','other') then p_intent else 'other' end;
        v_email text;
begin
  insert into public.agent_replies (lead_id, message_id, from_email, subject, body, intent, summary)
  values (p_lead_id, p_message_id, p_from_email, left(p_subject, 500), left(p_body, 5000), v_intent, left(p_summary, 500))
  on conflict (message_id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  insert into public.agent_activities (lead_id, type, body, meta)
  values (p_lead_id, 'reply', left(coalesce(p_summary, p_body), 500), jsonb_build_object('intent', v_intent, 'subject', left(p_subject, 500)));

  if v_intent = 'auto_reply' then return jsonb_build_object('ok', true, 'intent', v_intent); end if;

  update public.agent_leads
     set replied_at = now(), reply_intent = v_intent, reply_summary = left(p_summary, 500),
         do_not_contact = do_not_contact or v_intent = 'remove_me',
         status = case when status = 'signed_up' then status
                       when v_intent = 'remove_me' then 'do_not_contact'
                       when v_intent = 'not_interested' then 'not_interested' else 'replied' end
   where id = p_lead_id
   returning email into v_email;

  if v_intent = 'remove_me' then
    perform public.suppress_email(coalesce(v_email, p_from_email), 'unsubscribed', 'reply');
  end if;
  return jsonb_build_object('ok', true, 'intent', v_intent);
end $function$;

-- 7. link sign-ups to leads
CREATE OR REPLACE FUNCTION public.link_lead_on_signup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_ids uuid[];
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;
    IF v_email IS NULL THEN RETURN NEW; END IF;
    WITH u AS (
      UPDATE public.agent_leads SET user_id = NEW.id, stage = 'signed_up'
       WHERE lower(email) = lower(v_email) AND user_id IS NULL RETURNING id
    ) SELECT array_agg(id) INTO v_ids FROM u;
    IF v_ids IS NOT NULL THEN
      UPDATE public.agent_outreach SET status = 'skipped', error = 'signed up'
       WHERE lead_id = ANY(v_ids) AND status IN ('pending','approved');
      UPDATE public.drip_campaign_queue SET cancelled_at = now()
       WHERE lead_id = ANY(v_ids) AND NOT sent AND cancelled_at IS NULL;
      INSERT INTO public.agent_activities (lead_id, type, body) SELECT unnest(v_ids), 'signed_up', 'Created an app account';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'link_lead_on_signup failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER on_profile_created_link_lead AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.link_lead_on_signup();

-- backfill links for people who already signed up
UPDATE public.agent_leads a SET user_id = u.id, stage = 'signed_up'
FROM auth.users u WHERE a.user_id IS NULL AND a.email IS NOT NULL AND lower(u.email) = lower(a.email);

-- 8. overview numbers
CREATE OR REPLACE FUNCTION public.admin_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d0 timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'; result jsonb;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_agent_admin()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'emails_sent', (SELECT count(*) FROM public.agent_outreach WHERE channel = 'email' AND status = 'sent' AND sent_at >= d0)
                 + (SELECT count(*) FROM public.agent_activities WHERE type IN ('email_sent','campaign_send') AND created_at >= d0),
    'email_capacity', coalesce((SELECT (config->>'daily_cap')::int FROM public.agent_settings WHERE key = 'email_outreach' AND enabled), 0) + 50,
    'replies_waiting', (SELECT count(*) FROM public.agent_leads WHERE reply_intent IN ('interested','question') AND stage = 'replied' AND replied_at > now() - interval '7 days'),
    'interested_today', (SELECT count(*) FROM public.agent_replies WHERE intent = 'interested' AND received_at >= d0),
    'meetings_booked', (SELECT count(*) FROM public.agent_leads WHERE stage = 'meeting_booked'),
    'new_leads', (SELECT count(*) FROM public.agent_leads WHERE created_at >= d0 AND merged_into IS NULL),
    'new_signups', (SELECT count(*) FROM public.profiles WHERE created_at >= d0),
    'outreach_signups', (SELECT count(*) FROM public.profiles WHERE created_at >= d0 AND signup_ref IS NOT NULL AND signup_ref <> 'direct'),
    'pro_upgrades', (SELECT count(*) FROM public.credit_transactions WHERE type = 'subscription' AND created_at >= d0),
    'credit_purchases', (SELECT count(*) FROM public.credit_transactions WHERE type = 'credit_purchase' AND created_at >= d0),
    'drafts_pending', (SELECT count(*) FROM public.agent_outreach WHERE status = 'pending'),
    'failed_sends', (SELECT count(*) FROM public.agent_outreach WHERE status = 'failed' AND created_at > now() - interval '7 days'),
    'failed_emails_24h', (SELECT count(*) FROM public.email_send_log WHERE status IN ('failed','dlq','bounced') AND created_at > now() - interval '24 hours'),
    'last_email_error', (SELECT error_message FROM public.email_send_log WHERE status IN ('failed','dlq') AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 1),
    'suppressed_total', (SELECT count(*) FROM public.email_suppressions),
    'week', (SELECT jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'),
        'sent', (SELECT count(*) FROM public.agent_outreach WHERE status = 'sent' AND sent_at >= d AND sent_at < d + interval '1 day')
              + (SELECT count(*) FROM public.agent_activities WHERE type IN ('email_sent','campaign_send') AND created_at >= d AND created_at < d + interval '1 day'),
        'replies', (SELECT count(*) FROM public.agent_replies WHERE received_at >= d AND received_at < d + interval '1 day'),
        'signups', (SELECT count(*) FROM public.profiles WHERE created_at >= d AND created_at < d + interval '1 day')) ORDER BY d)
      FROM generate_series(d0 - interval '6 days', d0, interval '1 day') d)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
