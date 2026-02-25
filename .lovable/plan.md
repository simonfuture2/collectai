

## What's Possible and What's Not

**Logo**: I can generate a CollectAI logo using AI image generation (Lovable AI). I'll create a backend function that generates the logo, then save it to file storage so it loads instantly on every visit. The logo will replace the text-only "CollectAI" in the header.

**Video background**: I cannot generate video. However, here are realistic alternatives:

1. **AI-generated hero images** -- Generate a compelling illustration of someone excitedly scanning a trading card, displayed as a large hero background with a gradient overlay. This is fully achievable.
2. **Animated CSS/particle effects** -- Floating card silhouettes, sparkle particles, or a subtle animated gradient behind the hero section. Adds energy without needing real video.
3. **Embed a stock video** -- If you provide a video file or a URL to a royalty-free stock video (e.g., from Pexels), I can embed it as a looping muted background behind the hero.

## Proposed Plan

### 1. Generate CollectAI Logo
- Create a backend function that calls the AI image generation API with a prompt like: *"Modern app logo for 'CollectAI', a trading card scanning app. Purple and blue gradient colors, clean icon showing a card with an AI sparkle, flat design, transparent background, square format."*
- Upload the result to file storage.
- Add a logo generation page/button (or generate once and hardcode the stored URL).
- Replace the text-only `<h1>` in the header with an `<img>` logo across Landing, Dashboard, and other pages.

### 2. Animated Hero Background
Since video generation isn't available, I'll build an animated hero section with:
- **AI-generated hero illustration**: A wide banner image of an excited collector scanning cards, with a semi-transparent overlay so text remains readable.
- **Floating card animations**: CSS-animated card silhouettes drifting across the background (using `@keyframes` transforms).
- **Sparkle/particle effects**: Small animated dots/stars using CSS to create energy and excitement.

### 3. Landing Page Layout Update
- Wrap the hero section in a `relative overflow-hidden` container.
- Layer the animated background behind the existing hero text content.
- Add a gradient overlay (`bg-gradient-to-b from-background/80 to-background`) to ensure text contrast.

### Technical Details

- **Logo generation**: Uses `google/gemini-3-pro-image-preview` model via an edge function. The generated image is uploaded to a `logos` storage bucket, and the public URL is used in the app.
- **Hero image**: Same generation approach, stored in storage, displayed as a `background-image` with `object-cover`.
- **CSS animations**: Pure CSS floating cards using `@keyframes` with staggered `animation-delay` values. No JavaScript overhead.
- **Files to create/modify**:
  - `supabase/functions/generate-logo/index.ts` -- edge function for AI image generation
  - `src/components/HeroBackground.tsx` -- animated background component
  - `src/pages/Landing.tsx` -- integrate logo and hero background
  - `src/index.css` -- add floating card keyframe animations

