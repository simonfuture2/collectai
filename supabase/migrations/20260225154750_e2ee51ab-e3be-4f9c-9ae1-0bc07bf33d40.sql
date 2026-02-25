-- Create folders table
CREATE TABLE public.folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'folder',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create junction table for cards <-> folders (many-to-many)
CREATE TABLE public.card_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(card_id, folder_id)
);

-- Enable RLS
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_folders ENABLE ROW LEVEL SECURITY;

-- Folder policies
CREATE POLICY "Users can view their own folders" ON public.folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own folders" ON public.folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own folders" ON public.folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own folders" ON public.folders FOR DELETE USING (auth.uid() = user_id);

-- Card-folder policies (user owns the folder)
CREATE POLICY "Users can view their card-folder links" ON public.card_folders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.folders WHERE folders.id = card_folders.folder_id AND folders.user_id = auth.uid())
);
CREATE POLICY "Users can add cards to their folders" ON public.card_folders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.folders WHERE folders.id = card_folders.folder_id AND folders.user_id = auth.uid())
);
CREATE POLICY "Users can remove cards from their folders" ON public.card_folders FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.folders WHERE folders.id = card_folders.folder_id AND folders.user_id = auth.uid())
);

-- Indexes
CREATE INDEX idx_folders_user_id ON public.folders(user_id);
CREATE INDEX idx_card_folders_card_id ON public.card_folders(card_id);
CREATE INDEX idx_card_folders_folder_id ON public.card_folders(folder_id);