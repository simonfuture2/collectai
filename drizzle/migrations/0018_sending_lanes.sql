
-- Marketing opt-in on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Invalid user data: user ID is required';
  END IF;
  INSERT INTO public.profiles (id, display_name, marketing_opt_in, marketing_opt_in_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    CASE WHEN COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false) THEN now() END
  );
  INSERT INTO public.referral_codes (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Sending accounts (cold inboxes)
CREATE TABLE public.sending_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail','instantly','smartlead')),
  email text NOT NULL,
  domain text,
  display_name text,
  daily_limit int NOT NULL DEFAULT 30,
  warmup_start_date date,
  warmup_daily_increase int NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  paused_reason text,
  sent_today int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sending_accounts_email_unique ON public.sending_accounts (lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sending_accounts TO authenticated;
GRANT ALL ON public.sending_accounts TO service_role;
ALTER TABLE public.sending_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage sending accounts" ON public.sending_accounts FOR ALL TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));

-- Templates
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lane text NOT NULL DEFAULT 'cold' CHECK (lane IN ('cold','opted_in')),
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  audience_note text,
  legacy_template_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage email templates" ON public.email_templates FOR ALL TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Broadcasts
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES public.email_templates(id),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  spread_days int NOT NULL DEFAULT 1,
  ref_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','done','cancelled')),
  created_by uuid,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage broadcasts" ON public.broadcasts FOR ALL TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));

CREATE TABLE public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  lead_id uuid,
  user_id uuid,
  email text NOT NULL,
  lane text NOT NULL CHECK (lane IN ('cold','opted_in')),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','bounced','skipped','cancelled')),
  outreach_id uuid,
  error text,
  sent_at timestamptz,
  replied_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, email)
);
CREATE INDEX broadcast_recipients_due ON public.broadcast_recipients (status, scheduled_for);
CREATE INDEX broadcast_recipients_outreach ON public.broadcast_recipients (outreach_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO authenticated;
GRANT ALL ON public.broadcast_recipients TO service_role;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read broadcast recipients" ON public.broadcast_recipients FOR ALL TO authenticated
  USING (public.is_agent_admin() OR public.is_admin(auth.uid())) WITH CHECK (public.is_agent_admin() OR public.is_admin(auth.uid()));

-- Outreach rows: inbox assignment and schedule
ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS sending_account_id uuid REFERENCES public.sending_accounts(id);
ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS broadcast_id uuid;
ALTER TABLE public.agent_outreach ADD COLUMN IF NOT EXISTS provider_ref text;

-- Helpers
CREATE OR REPLACE FUNCTION public.us_state_tz(_state text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE upper(coalesce(btrim(_state), ''))
    WHEN 'CA' THEN 'America/Los_Angeles' WHEN 'WA' THEN 'America/Los_Angeles' WHEN 'OR' THEN 'America/Los_Angeles' WHEN 'NV' THEN 'America/Los_Angeles'
    WHEN 'AZ' THEN 'America/Phoenix' WHEN 'CO' THEN 'America/Denver' WHEN 'UT' THEN 'America/Denver' WHEN 'NM' THEN 'America/Denver'
    WHEN 'MT' THEN 'America/Denver' WHEN 'WY' THEN 'America/Denver' WHEN 'ID' THEN 'America/Denver'
    WHEN 'TX' THEN 'America/Chicago' WHEN 'IL' THEN 'America/Chicago' WHEN 'MN' THEN 'America/Chicago' WHEN 'WI' THEN 'America/Chicago'
    WHEN 'MO' THEN 'America/Chicago' WHEN 'IA' THEN 'America/Chicago' WHEN 'LA' THEN 'America/Chicago' WHEN 'OK' THEN 'America/Chicago'
    WHEN 'KS' THEN 'America/Chicago' WHEN 'NE' THEN 'America/Chicago' WHEN 'AR' THEN 'America/Chicago' WHEN 'MS' THEN 'America/Chicago'
    WHEN 'AL' THEN 'America/Chicago' WHEN 'TN' THEN 'America/Chicago' WHEN 'SD' THEN 'America/Chicago' WHEN 'ND' THEN 'America/Chicago'
    WHEN 'AK' THEN 'America/Anchorage' WHEN 'HI' THEN 'Pacific/Honolulu'
    ELSE 'America/New_York' END
$$;

CREATE OR REPLACE FUNCTION public.cold_send_window_open(_state text, _at timestamptz DEFAULT now())
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT extract(isodow FROM (_at AT TIME ZONE public.us_state_tz(_state))) BETWEEN 1 AND 5
     AND (_at AT TIME ZONE public.us_state_tz(_state))::time BETWEEN time '08:30' AND time '17:00'
$$;

-- Warm-up: 5 on the start day, + increase per day after, never above daily_limit.
CREATE OR REPLACE FUNCTION public.sending_account_capacity(_id uuid)
 RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN NOT a.active THEN 0
    WHEN a.warmup_start_date IS NULL THEN a.daily_limit
    WHEN current_date < a.warmup_start_date THEN 0
    ELSE least(a.daily_limit, 5 + (current_date - a.warmup_start_date) * a.warmup_daily_increase) END
  FROM public.sending_accounts a WHERE a.id = _id
$$;

CREATE OR REPLACE FUNCTION public.sending_account_used_today(_id uuid)
 RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM public.agent_outreach o
   WHERE o.sending_account_id = _id AND o.status IN ('sending','sent')
     AND coalesce(o.sent_at, o.claimed_at) >= date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
$$;

CREATE OR REPLACE FUNCTION public.cold_capacity_today()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_agent_admin()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN (SELECT jsonb_build_object(
    'capacity', coalesce(sum(public.sending_account_capacity(id)), 0),
    'used', coalesce(sum(public.sending_account_used_today(id)), 0),
    'inboxes', count(*) FILTER (WHERE active),
    'accounts', coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'capacity', public.sending_account_capacity(id), 'used', public.sending_account_used_today(id))), '[]'::jsonb))
    FROM public.sending_accounts);
END $$;

-- Cold claim: only gmail inboxes with room today, weekday business hours in the recipient's time,
-- never suppressed, do-not-contact, merged or opted-in (opted-in leads belong to the SendGrid lane).
DROP FUNCTION IF EXISTS public.agent_claim_approved_emails();
CREATE FUNCTION public.agent_claim_approved_emails()
 RETURNS TABLE(id uuid, lead_id uuid, to_email text, to_name text, subject text, body text, ref_code text,
               from_email text, reply_to text, physical_address text, base_url text,
               sending_account_id uuid, from_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE s public.agent_settings; r record; acc record;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE key = 'email_outreach';
  IF s IS NULL OR NOT s.enabled THEN RETURN; END IF;

  -- Wrong lane: opted-in leads are not sent from cold inboxes.
  UPDATE public.agent_outreach o SET status = 'failed', error = 'Refused: opted-in lead belongs to the SendGrid lane'
    FROM public.agent_leads l
   WHERE l.id = o.lead_id AND o.workflow = 'email_outreach' AND o.status = 'approved' AND l.consent_email;

  FOR r IN
    SELECT o.id AS oid, o.lead_id AS lid, l.email AS em, coalesce(l.name, l.business_name) AS nm,
           o.subject AS subj, coalesce(o.final_text, o.draft_text) AS bod, o.ref_code AS ref
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
    id := r.oid; lead_id := r.lid; to_email := r.em; to_name := r.nm; subject := r.subj; body := r.bod; ref_code := r.ref;
    from_email := coalesce(acc.display_name || ' <' || acc.email || '>', acc.email);
    reply_to := acc.email; physical_address := s.config->>'physical_address'; base_url := s.config->>'base_url';
    sending_account_id := acc.id; from_name := acc.display_name;
    RETURN NEXT;
    acc := NULL;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.agent_mark_outreach(p_id uuid, p_status text, p_error text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_acc uuid;
BEGIN
  UPDATE public.agent_outreach
     SET status = p_status, error = p_error,
         sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
   WHERE id = p_id
  RETURNING sending_account_id INTO v_acc;

  UPDATE public.broadcast_recipients
     SET status = CASE WHEN p_status IN ('sent','failed','bounced') THEN p_status ELSE status END,
         error = p_error, sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
   WHERE outreach_id = p_id;

  IF p_status = 'sent' THEN
    UPDATE public.agent_leads l
       SET status = CASE WHEN l.status IN ('new','drafting','queued') THEN 'contacted' ELSE l.status END,
           last_contacted_at = now()
      FROM public.agent_outreach o WHERE o.id = p_id AND l.id = o.lead_id;
    IF v_acc IS NOT NULL THEN
      UPDATE public.sending_accounts SET last_sent_at = now(), sent_today = public.sending_account_used_today(v_acc) WHERE id = v_acc;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- Templates: copy existing campaign templates (HTML stripped to plain text)
INSERT INTO public.email_templates (name, lane, subject, body, legacy_template_id, audience_note)
SELECT t.name, 'opted_in', coalesce(t.subject, ''),
  btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t.body,
     '<li[^>]*>', '- ', 'gi'), '</(p|li|h3|ul|ol|div)>|<br\s*/?>', E'\n', 'gi'), '<[^>]+>', '', 'g'), E'\n{3,}', E'\n\n', 'g')),
  t.id, 'Copied from the old Campaigns tab'
FROM public.campaign_templates t
WHERE t.channel = 'email' AND t.id <> 'b1968525-b440-4e5d-9695-d80321865e57';

INSERT INTO public.email_templates (name, lane, subject, body, legacy_template_id, audience_note) VALUES
('Story update - Collectors & creators', 'cold', 'A kid, a card, and why we built MyCollectAI',
$t$Hi {{first_name|there}},

It's Simon from MyCollectAI. I reached out a little while back and wanted to send a quick update, along with a story that reminded me why I started this.

What's new:
- Free price checks: scan a card and see what it's worth, no credits needed.
- Live scanning: hold your phone over a card and it reads it on the spot, one card after another.
- Pack Rip mode: scan your pulls as you open a pack and see your total and your biggest hit.
- Values based on PriceCharting market data, checked against recent eBay sales.
- Android app coming soon to Google Play.

The story: not long ago, a dad and his son scanned a card the boy had pulled. It was worth a lot more than they expected. Instead of taking the first offer, they got it graded. I wish you could have seen that kid's face when it came back.

It could easily have gone the other way. Families often don't know what a card is worth, and a quick sale can leave a lot on the table. That's why I built MyCollectAI: so collectors, young and old, know what they have before anyone else tells them.

If that matters to you too, I'd really appreciate your help spreading the word with your followers. Try it, share it, or just reply and tell me what you think.

Try it free: {{ref_link}}

Thanks for reading,
{{rep_name}}
Founder, MyCollectAI$t$, 'b1968525-b440-4e5d-9695-d80321865e57', 'Collectors and creators contacted before, no reply'),
('Story update - Card shops', 'cold', 'A kid, a card, and why we built MyCollectAI',
$t$Hi {{first_name|there}},

It's Simon from MyCollectAI. I reached out to {{business_name|your shop}} a little while back and wanted to send a quick update, along with a story that reminded me why I started this.

What's new:
- Free price checks: scan a card and see what it's worth, no credits needed. Handy at the counter.
- Live scanning: hold a phone over cards and it reads them one after another, so pricing a stack is quick.
- Pack Rip mode: customers can scan pulls as they open packs and see their total and biggest hit.
- Values based on PriceCharting market data, checked against recent eBay sales.
- Android app coming soon to Google Play.

The story: not long ago, a dad and his son scanned a card the boy had pulled. It was worth a lot more than they expected. Instead of taking the first offer, they got it graded. I wish you could have seen that kid's face when it came back.

Families often don't know what a card is worth. A shop that helps them find out earns a customer for life. That's why I built MyCollectAI, and why I'd love to have shops like yours using it and telling customers about it. If you want, reply and I'll set you up with a partner code.

Try it free: {{ref_link}}

Thanks for reading,
{{rep_name}}
Founder, MyCollectAI$t$, 'b1968525-b440-4e5d-9695-d80321865e57', 'Card shops and sellers contacted before, no reply');

COMMENT ON TABLE public.campaign_templates IS 'DEPRECATED: replaced by email_templates';
COMMENT ON TABLE public.outreach_campaigns IS 'DEPRECATED: replaced by broadcasts';
