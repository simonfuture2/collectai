# Fix the "See it in action" video being rate-limited

## What is happening
The featured video on the home page ("Pokemon Raw Cards - Should I get it Graded?") is a TikTok embed. On mycollectai.com, TikTok's own player server answers with "429 Too Many Requests" — TikTok is throttling its embedded player, not our site. Our card also asks TikTok to draw the player twice per visit (once from a retry timer and once when TikTok's script finishes loading), which doubles the requests and makes throttling more likely.

## Fix
1. **Stop the double request** — draw each TikTok/Instagram player only once.
2. **Don't load TikTok until the visitor taps play** on the home page — show a poster image with a play button; tapping loads the player. Fewer automatic hits to TikTok.
3. **Better fallback** — if TikTok still refuses, show the poster plus a clear "Watch on TikTok" button instead of a blank/broken box.
4. **Most reliable option (recommended):** download this featured TikTok clip (as was done for the homepage background), upload it as our own hosted video with a poster, and feature that copy instead. It then plays from our own storage and TikTok can't throttle it; the TikTok link stays on the card.

## Technical details
- `SocialVideoCard.tsx`: add a `rendered` guard so `tiktokEmbed.lib.render` / `instgrm.Embeds.process` runs once; clear the interval when the script's `.then` renders.
- Add a click-to-load mode for featured cards (activation on click, not IntersectionObserver); fetch a poster via TikTok oEmbed thumbnail when `poster_url` is empty, or use the uploaded poster.
- Step 4: yt-dlp + ffmpeg to 720px mp4, upload through the admin Videos tab as hosted, set it featured, un-feature the TikTok row.
- Verify on the preview with Playwright: no 429s on load, video plays/loads after tap.
