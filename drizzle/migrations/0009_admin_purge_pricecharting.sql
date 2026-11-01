CREATE OR REPLACE FUNCTION public.admin_purge_pricecharting(_confirm text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n_cards integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _confirm IS DISTINCT FROM 'PURGE PRICECHARTING' THEN RAISE EXCEPTION 'Confirmation text does not match'; END IF;
  DELETE FROM public.pricecharting_catalog WHERE id IS NOT NULL;
  DELETE FROM public.pricecharting_live_cache WHERE product_id IS NOT NULL;
  UPDATE public.cards SET pc_prices = NULL WHERE pc_prices IS NOT NULL;
  GET DIAGNOSTICS n_cards = ROW_COUNT;
  INSERT INTO public.app_settings(key, value, updated_at) VALUES ('price_check_enabled', 'false'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb, updated_at = now();
  RETURN jsonb_build_object('cards_cleared', n_cards);
END $$;
REVOKE ALL ON FUNCTION public.admin_purge_pricecharting(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_pricecharting(text) TO authenticated;