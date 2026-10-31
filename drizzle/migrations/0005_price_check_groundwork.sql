CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read app settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert app settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins update app settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete app settings" ON public.app_settings FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
INSERT INTO public.app_settings (key, value) VALUES ('price_check_enabled', 'false'::jsonb) ON CONFLICT DO NOTHING;
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_credits ADD COLUMN price_check_beta boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_beta_fields()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF NEW.beta_access_until IS DISTINCT FROM OLD.beta_access_until
     OR NEW.beta_eligible IS DISTINCT FROM OLD.beta_eligible
     OR NEW.beta_price_locked_at IS DISTINCT FROM OLD.beta_price_locked_at
     OR NEW.price_check_beta IS DISTINCT FROM OLD.price_check_beta THEN
    IF uid IS NULL OR jwt_role = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT public.is_admin(uid) THEN
      RAISE EXCEPTION 'Only admins may modify beta program fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_use_price_check(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce((SELECT (value)::text = 'true' FROM public.app_settings WHERE key = 'price_check_enabled'), false)
      OR public.is_admin(_uid)
      OR coalesce((SELECT price_check_beta FROM public.user_credits WHERE user_id = _uid), false);
$$;
REVOKE EXECUTE ON FUNCTION public.can_use_price_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_price_check(uuid) TO authenticated, service_role;

CREATE TABLE public.price_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  image_path text,
  identification jsonb,
  candidates jsonb,
  selected_product_id bigint,
  selected_prices jsonb,
  source text CHECK (source IN ('catalog','api','cache')),
  latency_ms int,
  pack_rip_id uuid,
  added_card_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_checks_user_created_idx ON public.price_checks (user_id, created_at DESC);
GRANT SELECT, DELETE ON public.price_checks TO authenticated;
GRANT ALL ON public.price_checks TO service_role;
ALTER TABLE public.price_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own price checks" ON public.price_checks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own price checks" ON public.price_checks FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.cards
  ADD COLUMN analysis_depth text NOT NULL DEFAULT 'full' CHECK (analysis_depth IN ('price_only','full')),
  ADD COLUMN pricecharting_id bigint,
  ADD COLUMN pc_prices jsonb,
  ADD COLUMN pc_synced_at timestamptz;

ALTER TABLE public.pricecharting_catalog
  ADD COLUMN condition_9_price integer, ADD COLUMN condition_10_price integer,
  ADD COLUMN condition_13_price integer, ADD COLUMN condition_14_price integer,
  ADD COLUMN condition_15_price integer, ADD COLUMN condition_16_price integer,
  ADD COLUMN condition_19_price integer, ADD COLUMN condition_20_price integer,
  ADD COLUMN condition_21_price integer, ADD COLUMN condition_22_price integer;
CREATE INDEX IF NOT EXISTS pricecharting_catalog_name_trgm_idx ON public.pricecharting_catalog USING gin (product_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pricecharting_catalog_cat_console_idx ON public.pricecharting_catalog (category, console_name);

CREATE TABLE public.pricecharting_live_cache (
  product_id bigint PRIMARY KEY,
  query text,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pricecharting_live_cache_query_uidx ON public.pricecharting_live_cache (lower(query));
GRANT ALL ON public.pricecharting_live_cache TO service_role;
ALTER TABLE public.pricecharting_live_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pricecharting_api_throttle (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_allowed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pricecharting_api_throttle TO service_role;
ALTER TABLE public.pricecharting_api_throttle ENABLE ROW LEVEL SECURITY;
INSERT INTO public.pricecharting_api_throttle (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.pc_acquire_slot()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  nxt timestamptz;
  slot timestamptz;
BEGIN
  INSERT INTO public.pricecharting_api_throttle (id) VALUES (1) ON CONFLICT DO NOTHING;
  SELECT next_allowed_at INTO nxt FROM public.pricecharting_api_throttle WHERE id = 1 FOR UPDATE;
  slot := greatest(clock_timestamp(), nxt);
  UPDATE public.pricecharting_api_throttle SET next_allowed_at = slot + interval '1100 milliseconds' WHERE id = 1;
  RETURN greatest(0, ceil(extract(epoch FROM (slot - clock_timestamp())) * 1000))::int;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pc_acquire_slot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_acquire_slot() TO service_role;