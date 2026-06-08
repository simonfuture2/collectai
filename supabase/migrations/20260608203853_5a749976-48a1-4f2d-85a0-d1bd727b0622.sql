
CREATE TABLE public.pricecharting_catalog (
  id bigint PRIMARY KEY,
  product_name text NOT NULL,
  console_name text,
  category text NOT NULL,
  loose_price integer,
  cib_price integer,
  new_price integer,
  graded_price integer,
  box_only_price integer,
  manual_only_price integer,
  bgs_10_price integer,
  condition_17_price integer,
  condition_18_price integer,
  release_date date,
  upc text,
  asin text,
  epid text,
  genre text,
  retail_loose_buy integer,
  retail_loose_sell integer,
  retail_cib_buy integer,
  retail_cib_sell integer,
  retail_new_buy integer,
  retail_new_sell integer,
  sales_volume integer,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pricecharting_catalog TO authenticated;
GRANT ALL ON public.pricecharting_catalog TO service_role;

ALTER TABLE public.pricecharting_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read catalog"
  ON public.pricecharting_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_pricecharting_catalog_category ON public.pricecharting_catalog (category);
CREATE INDEX idx_pricecharting_catalog_lower_name ON public.pricecharting_catalog (lower(product_name));
CREATE INDEX idx_pricecharting_catalog_cat_lower_name ON public.pricecharting_catalog (category, lower(product_name));
CREATE INDEX idx_pricecharting_catalog_name_tsv ON public.pricecharting_catalog USING GIN (to_tsvector('simple', product_name));

CREATE TRIGGER update_pricecharting_catalog_updated_at
  BEFORE UPDATE ON public.pricecharting_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
