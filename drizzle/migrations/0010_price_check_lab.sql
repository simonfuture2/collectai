CREATE TABLE public.price_check_lab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  image_path text NOT NULL,
  file_name text,
  game text NOT NULL,
  expected_product_id bigint NOT NULL,
  is_slab boolean NOT NULL DEFAULT false,
  is_japanese boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_check_lab_items TO authenticated;
GRANT ALL ON public.price_check_lab_items TO service_role;
ALTER TABLE public.price_check_lab_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage lab items" ON public.price_check_lab_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.price_check_lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.price_check_lab_items(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('price','full')),
  latency_ms integer,
  rank integer,
  top_product_id bigint,
  no_match boolean NOT NULL DEFAULT false,
  api_calls integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_check_lab_results_run_idx ON public.price_check_lab_results(run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_check_lab_results TO authenticated;
GRANT ALL ON public.price_check_lab_results TO service_role;
ALTER TABLE public.price_check_lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage lab results" ON public.price_check_lab_results FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.pricecharting_api_throttle ADD COLUMN IF NOT EXISTS calls_total bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.pc_acquire_slot()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE nxt timestamptz; slot timestamptz;
BEGIN
  INSERT INTO public.pricecharting_api_throttle (id) VALUES (1) ON CONFLICT DO NOTHING;
  SELECT next_allowed_at INTO nxt FROM public.pricecharting_api_throttle WHERE id = 1 FOR UPDATE;
  slot := greatest(clock_timestamp(), nxt);
  UPDATE public.pricecharting_api_throttle SET next_allowed_at = slot + interval '1100 milliseconds', calls_total = calls_total + 1 WHERE id = 1;
  RETURN greatest(0, ceil(extract(epoch FROM (slot - clock_timestamp())) * 1000))::int;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pc_acquire_slot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_acquire_slot() TO service_role;

CREATE OR REPLACE FUNCTION public.lab_pc_calls_total()
 RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN coalesce((SELECT calls_total FROM public.pricecharting_api_throttle WHERE id = 1), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.lab_pc_calls_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_pc_calls_total() TO authenticated;