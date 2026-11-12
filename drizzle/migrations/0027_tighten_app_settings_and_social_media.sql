DROP POLICY IF EXISTS "Authenticated can read app settings" ON public.app_settings;
CREATE POLICY "Admins read app settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Published social media can be viewed" ON storage.objects;
CREATE POLICY "Admins view social media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'social-videos' AND public.is_agent_admin());