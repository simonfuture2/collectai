# Get MyCollectAI onto Google Play

## Where things stand
- **Ready:** the Android app project exists (MyCollectAI, com.collectai.app, version 1.0). It targets the newest Android version Google requires. It has camera permission, a delete-account page and a privacy page.
- **Not ready:** push notifications are switched off, because the Firebase file isn't added. The app isn't signed or built for upload yet.
- **I can't submit it for you.** Uploading needs your Google Play developer account ($25 one-time), and the app has to be built and signed on a computer with Android Studio. I'll prepare everything and walk you through it.

## The 12-tester rule (personal developer accounts)
Google requires a **closed test with at least 12 testers who stay opted in for 14 days in a row** before you can apply for public release. Organisation accounts skip this. After the 14 days, you apply in Play Console and Google reviews it, usually within about a week.

## Steps
1. **I prepare the app (in this project):**
   - Point the app at your live site (mycollectai.com) so testers get the real app, not the preview
   - Check the app icon, splash screen and name
   - Make sure sign-in with Google and email works inside the app, and that it returns to the app after sign-in
   - Make sure the camera scan works in the app
   - Write the Play Store listing: short description, full description, what's new, and the Data safety answers (what the app collects: email, photos of cards, purchases)
   - Make phone-sized store screenshots and the 1024x500 feature graphic
2. **A tester sign-up page:** a simple page on your site, "Become an Android beta tester". It collects a Gmail address and joins people to a Google Group. You then add that group as your closed-test list once. I'll also draft a short message for your Discord, Reddit or collector friends, aimed at 20 sign-ups so you stay above 12 even if some drop out.
3. **You do (I'll give click-by-click steps):**
   - Create the Play developer account and verify your identity
   - Download the project from GitHub, open it in Android Studio, and build a signed app bundle
   - Create the app in Play Console, paste the listing, upload the bundle to **Closed testing**, and add the tester group
   - Keep 12+ testers opted in for 14 days, then click **Apply for production**
4. **Ads:** pausing the Google Search campaign until you say. Sign-up tracking still needs your cookie-banner choice.

## Questions I'll ask after you approve
- Do you already have a Google Play developer account? Is it personal or organisation?
- Do you want push notifications in version 1? This needs a free Firebase setup.

## Technical details
- Capacitor 8, targetSdk 36, minSdk 24, versionCode 1. Add `server.url` only if we choose to load the live site; otherwise ship the built `dist` bundle (preferred for review).
- OAuth inside the native WebView needs a deep-link/custom-scheme return. Verify `/~oauth` redirect handling.
- google-services.json is optional; leave push off if skipped.
- Record the tester-page and native-auth decisions in AGENTS.md; add roadmap items for Play submission and paused ads.
