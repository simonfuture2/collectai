CREATE POLICY "Only service role can insert credits"
  ON public.user_credits FOR INSERT
  TO authenticated
  WITH CHECK (false);