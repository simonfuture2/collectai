
CREATE TABLE public.bakeoff_truth (
  card_id UUID PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  card_name TEXT,
  card_number TEXT,
  card_set TEXT,
  card_year TEXT,
  variant TEXT,
  rarity TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bakeoff_truth TO authenticated;
GRANT ALL ON public.bakeoff_truth TO service_role;

ALTER TABLE public.bakeoff_truth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view bakeoff truth"
  ON public.bakeoff_truth FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert bakeoff truth"
  ON public.bakeoff_truth FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update bakeoff truth"
  ON public.bakeoff_truth FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete bakeoff truth"
  ON public.bakeoff_truth FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_bakeoff_truth_updated_at
  BEFORE UPDATE ON public.bakeoff_truth
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
