ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS back_image_url text;
ALTER TABLE public.price_checks ADD COLUMN IF NOT EXISTS back_image_path text;