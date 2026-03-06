

## Assessment: Not Yet Ready for Google Play

Your app has Capacitor configured for native builds, but is **missing several key pieces** for both PWA and Google Play submission.

### What's Already Done
- Capacitor config with app ID `com.collectai.app`, splash screen settings
- Basic meta tags and structured data in index.html

### What's Missing

#### 1. PWA Essentials (currently no PWA support)
- **No `vite-plugin-pwa`** installed or configured
- **No `manifest.json`** (required for installability)
- **No service worker** (required for offline support)
- **No PWA icons** (192x192 and 512x512 required)

#### 2. Google Play Store Requirements
- **Privacy Policy page** — required by Google Play (you have `/privacy`, needs verification it's complete)
- **Data deletion support** — per your compliance notes, users must be able to request data deletion
- **App icons** — need proper adaptive icons for Android (foreground + background layers)
- **Keystore setup** — `keystorePath` and `keystoreAlias` are `undefined` in capacitor config
- **Data Safety declaration** — photos encrypted in transit, blockchain for digital assets

#### 3. Capacitor Config Fix
- `appId` should be `app.lovable.7e6b30f7ba0740d087d375a902ce186b` per Lovable conventions (or keep `com.collectai.app` if you own that domain)

### Implementation Plan

| Step | What |
|------|------|
| 1 | Install `vite-plugin-pwa`, configure in `vite.config.ts` with manifest, icons, service worker |
| 2 | Create PWA icons (192x192, 512x512) and add to `public/` |
| 3 | Add mobile meta tags to `index.html` (theme-color, apple-touch-icon, etc.) |
| 4 | Add an `/install` page with install prompt for mobile users |
| 5 | Ensure `/privacy` page covers Google Play data safety requirements |
| 6 | Add account/data deletion feature (required by Google Play policy) |

### Files to Create/Modify
- `vite.config.ts` — add VitePWA plugin
- `public/manifest.json` — app manifest
- `public/` — PWA icons
- `index.html` — mobile meta tags
- `src/pages/Install.tsx` — install prompt page
- `src/App.tsx` — add install route

### After Code Changes (Your Local Steps)
1. Export to GitHub, git pull
2. `npm install`
3. `npx cap add android`
4. `npx cap sync`
5. Open in Android Studio: `npx cap open android`
6. Generate signed APK/AAB for Play Store submission

For the full native build guide, see the [Lovable Capacitor blog post](https://docs.lovable.dev/).

