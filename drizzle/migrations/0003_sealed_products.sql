ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS upc text;
ALTER TABLE public.cards ADD CONSTRAINT cards_item_type_chk CHECK (item_type IN ('card','slab','sealed'));

CREATE TABLE public.sealed_chase_cache (
  cache_key text PRIMARY KEY,
  category text NOT NULL,
  set_name text NOT NULL,
  payload jsonb NOT NULL,
  source text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sealed_chase_cache TO authenticated;
GRANT ALL ON public.sealed_chase_cache TO service_role;
ALTER TABLE public.sealed_chase_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read chase cache" ON public.sealed_chase_cache FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS pricecharting_catalog_console_idx ON public.pricecharting_catalog (category, console_name);
CREATE INDEX IF NOT EXISTS pricecharting_catalog_upc_idx ON public.pricecharting_catalog (upc) WHERE upc IS NOT NULL;