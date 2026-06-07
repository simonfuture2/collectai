// Kill-switch service worker. Replaces any previously registered app SW at
// this path, clears its caches, navigates open clients to fresh HTML, then
// unregisters itself. Returning browsers get freed on their next visit.
//
// Cache Storage is origin-scoped; only delete caches that belong to this
// registration so we don't wipe Firebase Messaging / OneSignal caches.
function isWorkboxCacheForThisRegistration(name) {
  const hasWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-|(^|-)html-shell/.test(name);
  return hasWorkboxBucket;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const toDelete = cacheNames.filter(isWorkboxCacheForThisRegistration);
        await Promise.allSettled(toDelete.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);

// Pass through any fetch — do not serve anything from cache.
self.addEventListener("fetch", () => {});
