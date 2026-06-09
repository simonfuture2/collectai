UPDATE public.campaign_templates
SET body = REPLACE(REPLACE(body, 'https://collectai.lovable.app', 'https://mycollectai.com'), 'http://collectai.lovable.app', 'https://mycollectai.com')
WHERE body LIKE '%collectai.lovable.app%';