
-- Create lead status enum
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'interested', 'converted', 'lost');

-- Create lead source enum
CREATE TYPE public.lead_source AS ENUM ('form', 'manual', 'csv');

-- Create campaign channel enum
CREATE TYPE public.campaign_channel AS ENUM ('email', 'sms');

-- Create activity type enum
CREATE TYPE public.activity_type AS ENUM ('email_sent', 'sms_sent', 'status_change', 'note', 'call');

-- Create campaign status enum
CREATE TYPE public.campaign_status AS ENUM ('draft', 'sending', 'sent');

-- 1. Leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  source lead_source NOT NULL DEFAULT 'manual',
  status lead_status NOT NULL DEFAULT 'new',
  partner_code TEXT,
  notes TEXT,
  assigned_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all leads" ON public.leads FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert leads" ON public.leads FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update leads" ON public.leads FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete leads" ON public.leads FOR DELETE USING (public.is_admin(auth.uid()));
-- Allow public inserts from partner-signup (service role used in edge function)

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Campaign templates table
CREATE TABLE public.campaign_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel campaign_channel NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view templates" ON public.campaign_templates FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert templates" ON public.campaign_templates FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update templates" ON public.campaign_templates FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete templates" ON public.campaign_templates FOR DELETE USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_campaign_templates_updated_at BEFORE UPDATE ON public.campaign_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Lead activities table
CREATE TABLE public.lead_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activities" ON public.lead_activities FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert activities" ON public.lead_activities FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- 4. Outreach campaigns table
CREATE TABLE public.outreach_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.campaign_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status campaign_status NOT NULL DEFAULT 'draft',
  target_filter JSONB DEFAULT '{}',
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view campaigns" ON public.outreach_campaigns FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert campaigns" ON public.outreach_campaigns FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update campaigns" ON public.outreach_campaigns FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete campaigns" ON public.outreach_campaigns FOR DELETE USING (public.is_admin(auth.uid()));
