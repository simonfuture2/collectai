-- Add a category column for auto-categorization
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS category text DEFAULT 'Trading Card';

-- Add index for faster filtering/search
CREATE INDEX IF NOT EXISTS idx_cards_user_category ON public.cards (user_id, category);
CREATE INDEX IF NOT EXISTS idx_cards_card_name_trgm ON public.cards USING btree (card_name);
CREATE INDEX IF NOT EXISTS idx_cards_card_set ON public.cards (card_set);