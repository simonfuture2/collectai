CREATE TABLE public.social_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'hosted')),
  url text NOT NULL,
  poster_url text,
  title text NOT NULL,
  caption text,
  category text NOT NULL DEFAULT 'scan' CHECK (category IN ('scan', 'card_show', 'pack_opening', 'tips', 'other')),
  featured boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_videos_hosted_poster CHECK (platform <> 'hosted' OR nullif(btrim(poster_url), '') IS NOT NULL)
);
GRANT SELECT ON public.social_videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_videos TO authenticated;
GRANT ALL ON public.social_videos TO service_role;
ALTER TABLE public.social_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published videos are public" ON public.social_videos FOR SELECT TO anon, authenticated USING (published);
CREATE POLICY "Agent admins manage videos" ON public.social_videos FOR ALL TO authenticated USING (public.is_agent_admin()) WITH CHECK (public.is_agent_admin());
CREATE POLICY "Published social media can be viewed" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'social-videos' AND (public.is_agent_admin() OR EXISTS (SELECT 1 FROM public.social_videos v WHERE v.published AND (v.url = name OR v.poster_url = name))));
CREATE POLICY "Agent admins upload social media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'social-videos' AND public.is_agent_admin());
CREATE POLICY "Agent admins update social media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'social-videos' AND public.is_agent_admin()) WITH CHECK (bucket_id = 'social-videos' AND public.is_agent_admin());
CREATE POLICY "Agent admins delete social media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'social-videos' AND public.is_agent_admin());