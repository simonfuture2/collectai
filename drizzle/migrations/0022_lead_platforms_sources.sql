ALTER TABLE public.agent_leads DROP CONSTRAINT IF EXISTS agent_leads_platform_check;
ALTER TABLE public.agent_leads ADD CONSTRAINT agent_leads_platform_check CHECK (platform = ANY (ARRAY['instagram','tiktok','reddit','discord','email','other','places','youtube','ebay','whatnot','tcgplayer','etsy','event']));
ALTER TABLE public.agent_leads DROP CONSTRAINT IF EXISTS agent_leads_source_check;
ALTER TABLE public.agent_leads ADD CONSTRAINT agent_leads_source_check CHECK (source IS NULL OR char_length(source) BETWEEN 1 AND 120);