
CREATE TABLE public.pack_rips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  set_name TEXT NOT NULL,
  retail_cost NUMERIC,
  pulls JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_value NUMERIC NOT NULL DEFAULT 0,
  best_pull_name TEXT,
  best_pull_value NUMERIC,
  share_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pack_rips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pack rips"
ON public.pack_rips FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view pack rips by share token"
ON public.pack_rips FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own pack rips"
ON public.pack_rips FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pack rips"
ON public.pack_rips FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pack rips"
ON public.pack_rips FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_pack_rips_user ON public.pack_rips(user_id, created_at DESC);
CREATE INDEX idx_pack_rips_share_token ON public.pack_rips(share_token);

CREATE TRIGGER update_pack_rips_updated_at
BEFORE UPDATE ON public.pack_rips
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
