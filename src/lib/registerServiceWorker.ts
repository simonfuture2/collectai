// App-shell service workers caused stale-chunk / blank-screen errors on the
// Lovable preview. We now ship a kill-switch SW at /sw.js (see public/sw.js)
// and never register a new app SW from the client. This module's only job is
// to make sure any lingering app SW is unregistered on boot.
async function unregisterAppServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          const workers = [registration.active, registration.waiting, registration.installing];
          return workers.some((worker) => {
            const url = worker?.scriptURL ?? "";
            // Leave messaging workers (Firebase / OneSignal) alone.
            if (url.includes("firebase-messaging-sw") || url.includes("OneSignalSDKWorker")) {
              return false;
            }
            return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
          });
        })
        .map((registration) => registration.unregister()),
    );
  } catch {
    // Keep app boot resilient when browser privacy settings block SW APIs.
  }
}

export async function registerServiceWorker() {
  // Intentionally never register — only clean up.
  // The kill-switch SW served at /sw.js will unregister itself if any older
  // browser re-fetches it, but we also proactively unregister here for any
  // session that already booted before the kill-switch worker took over.
  await unregisterAppServiceWorkers();
}
