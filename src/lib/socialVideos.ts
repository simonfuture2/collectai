import type { Database } from "@/integrations/supabase/types";

export type SocialVideo = Database["public"]["Tables"]["social_videos"]["Row"];
export const SOCIAL_SCAN_URL = "/?ref=social_page#demo-scan";
export const VIDEO_CATEGORIES = [
  { value: "scan", label: "Scans" }, { value: "card_show", label: "Card shows" },
  { value: "pack_opening", label: "Pack openings" }, { value: "tips", label: "Tips" },
  { value: "other", label: "Other" },
] as const;
export const EMBED_TIMEOUT_MS = 8000;

export function isSupportedVideoUpload(file: { name: string; type: string }): boolean {
  return ["video/mp4", "video/quicktime"].includes(file.type) || /\.(mp4|mov)$/i.test(file.name);
}

export function detectSocialPlatform(value: string): "tiktok" | "instagram" | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (["tiktok.com", "www.tiktok.com"].includes(url.hostname) && /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname)) return "tiktok";
    if (["instagram.com", "www.instagram.com"].includes(url.hostname) && /^\/(reel|p)\/[\w-]+\/?$/.test(url.pathname)) return "instagram";
  } catch { /* invalid URL */ }
  return null;
}

export function tiktokVideoId(url: string): string | null {
  return detectSocialPlatform(url) === "tiktok" ? new URL(url).pathname.match(/\/video\/(\d+)/)?.[1] ?? null : null;
}

export function safeMediaUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}

export function orderedVideos<T extends Pick<SocialVideo, "featured" | "sort_order" | "created_at">>(videos: T[]): T[] {
  return [...videos].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order || Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function publicVideos(videos: SocialVideo[], featuredOnly = false): SocialVideo[] {
  const ordered = orderedVideos(videos.filter((v) => v.published && (!featuredOnly || v.featured)));
  return featuredOnly ? ordered.slice(0, 3) : ordered;
}

export function needsVideoCta(index: number): boolean { return (index + 1) % 6 === 0; }

export function validateVideo(video: Pick<SocialVideo, "platform" | "url" | "poster_url" | "title">): string | null {
  if (!video.title.trim()) return "Add a title.";
  if (video.platform !== "hosted") return detectSocialPlatform(video.url) === video.platform ? null : "Use a full TikTok video or Instagram reel/post URL.";
  if (!video.url.trim()) return "Upload an MP4 or MOV video.";
  if (!video.poster_url?.trim()) return "Add a poster image for your video.";
  return null;
}