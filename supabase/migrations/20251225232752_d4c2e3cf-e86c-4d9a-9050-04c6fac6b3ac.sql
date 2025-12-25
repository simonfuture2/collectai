-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Create cards table
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  card_name TEXT,
  card_set TEXT,
  card_year TEXT,
  edition TEXT,
  rarity TEXT,
  condition_grade TEXT,
  special_features TEXT[],
  estimated_value_low DECIMAL(10,2),
  estimated_value_high DECIMAL(10,2),
  ebay_recent_sales JSONB,
  tcgplayer_price JSONB,
  psa_population_data JSONB,
  notes TEXT,
  ai_analysis JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cards
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Cards policies
CREATE POLICY "Users can view their own cards" 
ON public.cards FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cards" 
ON public.cards FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cards" 
ON public.cards FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cards" 
ON public.cards FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for card images
INSERT INTO storage.buckets (id, name, public) VALUES ('card-images', 'card-images', true);

-- Storage policies for card images
CREATE POLICY "Users can upload their own card images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own card images"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own card images"
ON storage.objects FOR DELETE
USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view card images"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images');