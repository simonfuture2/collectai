CREATE OR REPLACE FUNCTION public.pc_refresh_cards_from_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n_updated int; n_revalued int;
BEGIN
  CREATE TEMP TABLE _pc_refresh ON COMMIT DROP AS
  SELECT c.id AS card_id, c.user_id,
    (c.analysis_depth = 'price_only' OR c.ai_analysis->>'valuationSource' = 'pricecharting') AS eligible,
    coalesce(nullif(c.ai_analysis->>'pcRung',''), 'ungraded') AS rung,
    jsonb_strip_nulls(jsonb_build_object(
      'ungraded', nullif(p.loose_price,0)/100.0,
      'grade1', nullif(p.condition_9_price,0)/100.0,
      'grade2', nullif(p.condition_10_price,0)/100.0,
      'grade3', nullif(p.condition_13_price,0)/100.0,
      'grade4', nullif(p.condition_14_price,0)/100.0,
      'grade5', nullif(p.condition_15_price,0)/100.0,
      'grade6', nullif(p.condition_16_price,0)/100.0,
      'grade7', nullif(p.cib_price,0)/100.0,
      'grade8', nullif(p.new_price,0)/100.0,
      'grade9', nullif(p.graded_price,0)/100.0,
      'grade9_5', nullif(p.box_only_price,0)/100.0,
      'psa10', nullif(p.manual_only_price,0)/100.0,
      'bgs10', nullif(p.bgs_10_price,0)/100.0,
      'cgc10', nullif(p.condition_17_price,0)/100.0,
      'sgc10', nullif(p.condition_18_price,0)/100.0,
      'cgc10_pristine', nullif(p.condition_19_price,0)/100.0,
      'bgs10_black', nullif(p.condition_20_price,0)/100.0,
      'tag10', nullif(p.condition_21_price,0)/100.0,
      'ace10', nullif(p.condition_22_price,0)/100.0
    )) AS ladder
  FROM public.cards c
  JOIN public.pricecharting_catalog p ON p.id = c.pricecharting_id;

  ALTER TABLE _pc_refresh ADD COLUMN price numeric;
  UPDATE _pc_refresh SET price = round((ladder->>rung)::numeric, 2) WHERE eligible AND ladder ? rung;

  UPDATE public.cards c SET
    pc_prices = r.ladder,
    pc_synced_at = now(),
    estimated_value_low = CASE WHEN r.price > 0 THEN round(r.price * 0.9, 2) ELSE c.estimated_value_low END,
    estimated_value_high = CASE WHEN r.price > 0 THEN round(r.price * 1.1, 2) ELSE c.estimated_value_high END,
    ai_analysis = CASE WHEN r.price > 0 AND c.ai_analysis IS NOT NULL
      THEN c.ai_analysis || jsonb_build_object('pcValue', r.price, 'pcLadder', r.ladder,
             'estimatedValueLow', round(r.price * 0.9, 2), 'estimatedValueHigh', round(r.price * 1.1, 2))
      ELSE c.ai_analysis END
  FROM _pc_refresh r WHERE c.id = r.card_id;
  GET DIAGNOSTICS n_updated = ROW_COUNT;

  INSERT INTO public.price_history (card_id, user_id, source, median_price, low_price, high_price, price_count, raw_prices)
  SELECT card_id, user_id, 'pricecharting', price, price, price, 1, jsonb_build_array(price)
  FROM _pc_refresh WHERE price > 0;
  GET DIAGNOSTICS n_revalued = ROW_COUNT;

  RETURN jsonb_build_object('updated', n_updated, 'revalued', n_revalued, 'historyRows', n_revalued);
END;
$$;

REVOKE ALL ON FUNCTION public.pc_refresh_cards_from_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_refresh_cards_from_catalog() TO service_role;