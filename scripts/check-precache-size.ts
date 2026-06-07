/**
 * Previously: post-build check for Workbox precache asset sizes.
 *
 * The app no longer uses vite-plugin-pwa (the app service worker was causing
 * stale-chunk / blank-screen errors on the Lovable preview). Kept as a no-op
 * so the existing `build` script keeps working without changes.
 */
console.log("[check-precache-size] skipped — vite-plugin-pwa is no longer used.");
