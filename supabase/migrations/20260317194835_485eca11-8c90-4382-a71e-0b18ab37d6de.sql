
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source text NOT NULL,
  median_price numeric,
  low_price numeric,
  high_price numeric,
  price_count integer DEFAULT 0,
  raw_prices jsonb DEFAULT '[]'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own price history"
  ON public.price_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own price history"
  ON public.price_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_price_history_card_id ON public.price_history(card_id);
CREATE INDEX idx_price_history_user_id ON public.price_history(user_id);
