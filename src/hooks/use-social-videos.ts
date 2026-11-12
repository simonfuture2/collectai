import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSocialVideos(featuredOnly = false) {
  return useQuery({
    queryKey: ["social-videos", featuredOnly ? "featured" : "published"],
    queryFn: async () => {
      let query = supabase.from("social_videos").select("*").eq("published", true)
        .order("featured", { ascending: false }).order("sort_order").order("created_at", { ascending: false });
      if (featuredOnly) query = query.eq("featured", true).limit(3);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60000,
  });
}

export async function resolveSocialMedia(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("https://")) return value;
  const { data: own } = await supabase.storage.from("social-videos").createSignedUrl(value, 3600);
  if (own?.signedUrl) return own.signedUrl; // admins can sign directly
  const { data, error } = await supabase.functions.invoke("social-media-url", { body: { path: value } });
  if (error || !data?.url) return null;
  return data.url as string;
}

export function useSocialMedia(value: string | null) {
  return useQuery({ queryKey: ["social-video-media", value], queryFn: () => resolveSocialMedia(value), enabled: !!value, staleTime: 30 * 60000, refetchInterval: 30 * 60000 });
}