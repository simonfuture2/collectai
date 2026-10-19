import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSocialPlatform, publicVideos, orderedVideos, validateVideo, needsVideoCta, SOCIAL_SCAN_URL, EMBED_TIMEOUT_MS } from "./socialVideos.ts";

test("only full TikTok video and Instagram post/reel URLs are accepted", () => {
  assert.equal(detectSocialPlatform("https://www.tiktok.com/@collectai/video/123456789"), "tiktok");
  assert.equal(detectSocialPlatform("https://www.instagram.com/reel/Ab-c_12/"), "instagram");
  assert.equal(detectSocialPlatform("https://instagram.com/p/Ab12/"), "instagram");
  for (const url of ["https://tiktok.com.evil.test/@x/video/123", "http://tiktok.com/@x/video/123", "https://tiktok.com/@x", "https://instagram.com/stories/x", "javascript:alert(1)"]) assert.equal(detectSocialPlatform(url), null);
});
const videos = Array.from({ length: 5 }, (_, i) => ({ id: String(i), platform: "hosted", url: `clip-${i}.mp4`, poster_url: "poster.jpg", title: "Clip", caption: null, category: "scan", published: i !== 0, featured: true, sort_order: i, created_at: "2026-10-19T00:00:00Z" }));
test("public results hide unpublished rows and home returns only three featured rows", () => {
  assert.deepEqual(publicVideos(videos).map(v => v.id), ["1", "2", "3", "4"]);
  assert.deepEqual(publicVideos(videos, true).map(v => v.id), ["1", "2", "3"]);
  assert.equal(publicVideos(videos.map(v => ({ ...v, featured: false })), true).length, 0);
});
test("videos order by featured then sort order then newest", () => {
  assert.deepEqual(orderedVideos([{ id: "a", featured: false, sort_order: 0, created_at: "2026-10-19" }, { id: "b", featured: true, sort_order: 1, created_at: "2026-10-18" }, { id: "c", featured: true, sort_order: 1, created_at: "2026-10-19" }]).map(v => v.id), ["c", "b", "a"]);
});
test("hosted videos require a poster", () => {
  assert.equal(validateVideo({ title: "Clip", platform: "hosted", url: "clip.mp4", poster_url: null }), "Add a poster image for your video.");
  assert.equal(validateVideo({ title: "Clip", platform: "hosted", url: "clip.mp4", poster_url: "poster.jpg" }), null);
});
test("CTA is inserted after each six videos", () => {
  assert.deepEqual(Array.from({ length: 13 }, (_, i) => i).filter(needsVideoCta), [5, 11]);
});
test("social scan attribution and eight-second embed fallback", () => {
  assert.equal(new URL(SOCIAL_SCAN_URL, "https://mycollectai.com").searchParams.get("ref"), "social_page");
  assert.equal(EMBED_TIMEOUT_MS, 8000);
});