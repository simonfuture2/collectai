ALTER TABLE public.price_checks ADD COLUMN IF NOT EXISTS picked_rank integer, ADD COLUMN IF NOT EXISTS game text;

CREATE OR REPLACE FUNCTION public.price_check_accuracy(_days integer DEFAULT 30)
RETURNS TABLE(game text, total bigint, top1_pct numeric, top3_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  SELECT coalesce(nullif(pc.game, ''), 'unknown') AS game,
         count(*) AS total,
         round(100.0 * count(*) FILTER (WHERE pc.picked_rank IS NULL OR pc.picked_rank = 1) / count(*), 0),
         round(100.0 * count(*) FILTER (WHERE pc.picked_rank IS NULL OR pc.picked_rank BETWEEN 1 AND 3) / count(*), 0)
  FROM public.price_checks pc
  WHERE pc.created_at >= now() - make_interval(days => greatest(1, least(_days, 365)))
    AND jsonb_typeof(pc.candidates) = 'array' AND jsonb_array_length(pc.candidates) > 0
  GROUP BY 1 ORDER BY 2 DESC;
END $$;
REVOKE ALL ON FUNCTION public.price_check_accuracy(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.price_check_accuracy(integer) TO authenticated;