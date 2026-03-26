-- Add last_scanned_at column to cards table
ALTER TABLE public.cards ADD COLUMN last_scanned_at timestamp with time zone DEFAULT now();

-- Backfill existing cards with their updated_at value
UPDATE public.cards SET last_scanned_at = updated_at WHERE last_scanned_at IS NULL;