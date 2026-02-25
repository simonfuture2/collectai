

# Preparing CollectAI for Google Play Store

## Important Limitation

I cannot directly upload your app to the Google Play Store. This requires actions outside of Lovable that only you can perform. However, I can prepare everything on the code side to make the process as smooth as possible.

## What I Can Do (Code Changes)

1. **Update Capacitor config** — Set a proper app ID (e.g., `com.collectai.app`), display name, and remove the remote server URL so the app runs from the local bundle (required for Play Store).

2. **Add Android build helper scripts** — Add npm scripts for syncing and building the Android project.

3. **Ensure proper app metadata** — Set version name and version code in the config.

## What You Must Do (Manual Steps)

These steps happen outside Lovable and require your local machine:

1. **Create a Google Play Developer account** — $25 one-time fee at [play.google.com/console](https://play.google.com/console)

2. **Clone the repo and build locally**:
   ```text
   git clone <your-repo-url>
   cd collectai
   npm install
   npm run build
   npx cap sync android
   npx cap open android
   ```

3. **In Android Studio**:
   - Generate a signed App Bundle (AAB) via Build → Generate Signed Bundle
   - Create a keystore (keep it safe — you need it for all future updates)

4. **In Google Play Console**:
   - Create a new app listing
   - Upload the signed AAB
   - Provide store assets: app icon (512x512), feature graphic (1024x500), at least 2 screenshots
   - Fill in content rating questionnaire, privacy policy URL, and app description
   - Submit for review (typically 1-7 days)

## Technical Details

### Capacitor Config Changes
- Change `appId` from the Lovable default to a proper reverse-domain format like `com.collectai.app`
- Remove the `server.url` property so the app uses the bundled web assets instead of loading from a remote URL (Google Play requires self-contained apps)
- Add `appName: 'CollectAI'` with proper casing

### Privacy Policy
Your app already has a Privacy Policy page at `/privacy` — you'll need the published URL (`https://collectai.lovable.app/privacy`) for the Play Store listing.

