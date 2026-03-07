
-- Create push_tokens table
CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

-- Enable RLS
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view their own tokens
CREATE POLICY "Users can view their own push tokens"
  ON public.push_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert their own push tokens"
  ON public.push_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete their own push tokens"
  ON public.push_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own tokens
CREATE POLICY "Users can update their own push tokens"
  ON public.push_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all tokens (for broadcasts)
CREATE POLICY "Admins can view all push tokens"
  ON public.push_tokens FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
