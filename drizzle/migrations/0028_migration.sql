ALTER TABLE public.sending_accounts ADD COLUMN IF NOT EXISTS connection_secret text;
ALTER TABLE public.sending_accounts ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
ALTER TABLE public.sending_accounts ADD COLUMN IF NOT EXISTS check_error text;
INSERT INTO public.sending_accounts (provider, email, domain, display_name, daily_limit, warmup_start_date, connection_secret)
VALUES ('gmail', 'mycollectaiteam@gmail.com', 'gmail.com', 'Simon from MyCollectAI', 30, current_date, 'GOOGLE_MAIL_API_KEY')
ON CONFLICT (lower(email)) DO UPDATE SET connection_secret = EXCLUDED.connection_secret;