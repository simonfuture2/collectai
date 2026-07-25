
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS is_authenticated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authentication_data jsonb,
  ADD COLUMN IF NOT EXISTS authenticated_at timestamptz,
  ADD COLUMN IF NOT EXISTS grading_company text,
  ADD COLUMN IF NOT EXISTS grading_cert_number text,
  ADD COLUMN IF NOT EXISTS grade_numeric numeric,
  ADD COLUMN IF NOT EXISTS paired_raw_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cards_pair_lookup_idx
  ON public.cards (user_id, card_name, card_set, edition);

CREATE INDEX IF NOT EXISTS cards_superseded_by_idx
  ON public.cards (superseded_by_card_id);

CREATE INDEX IF NOT EXISTS cards_paired_raw_idx
  ON public.cards (paired_raw_card_id);

UPDATE public.cards
  SET is_authenticated = true,
      authenticated_at = COALESCE(authenticated_at, updated_at)
  WHERE authentiseal_serial IS NOT NULL
    AND is_authenticated = false;
