## Why mycollectai.com goes blank

Your DevTools errors confirm the cause:

- `index-BkTw_Akm.css` served as `text/plain` and `index-CjxIsh9g.js` → 404 mean your browser is loading an **old `index.html` from cache** that references asset filenames the new deploy no longer has.
- `manifest.webmanifest` 404 + `favicon.png` 404 say the cached HTML is from a deploy where those paths existed differently.
- Lovable serves `index.html` with `no-cache` headers, so the HTTP cache isn't doing this on its own — a **leftover service worker** from the old PWA is intercepting requests and returning the stale shell.

The kill-switch worker in `public/sw.js` is meant to fix this, but it navigates clients **before** unregistering, so the rescued navigation can still go through the dying SW and re-serve stale HTML. Plus, if the first `/src/...` request fails, `src/main.tsx` never runs and the in-app recovery never fires.

## Fix — three small changes

### 1. `public/sw.js` — unregister before navigating

Reorder the `activate` handler:

```text
1. delete only this registration's Workbox caches  (unchanged)
2. await self.registration.unregister()            ← BEFORE navigate
3. clients.claim()
4. clients.matchAll() → client.navigate(client.url)
```

This guarantees the post-cleanup navigation is uncontrolled by the SW and always hits the network for a fresh `index.html` + fresh hashed asset URLs.

### 2. `index.html` — inline pre-boot guard

Add a small inline `<script>` at the top of `<body>`, **before** the `main.tsx` module tag. No imports, ~25 lines. It runs even when hashed chunks 404:

- Best-effort unregister any `/sw.js` / `/service-worker.js` registrations (leave Firebase Messaging / OneSignal workers alone).
- Listen for `error` events bubbling from `<script type="module">` / `<link rel="stylesheet">` that fail to load. On the first such failure: `caches.delete(...)` all caches, unregister SWs, then `location.replace(url + '?_r=' + Date.now())` exactly once (guarded by `sessionStorage` so it can't loop).

This catches the exact scenario your DevTools shows: cached HTML pointing at 404'd assets, where `main.tsx` never gets a chance to run its existing chunk-recovery logic.

### 3. `index.html` — clean up dead PWA tags

- Remove `<link rel="manifest" href="/manifest.webmanifest">` (project no longer ships a real PWA; just generates 404s).
- Remove `<link rel="apple-touch-icon" href="/pwa-192x192.png">` (icon file isn't shipped either).
- Replace deprecated `<meta name="apple-mobile-web-app-capable">` with `<meta name="mobile-web-app-capable">` (keep the Apple one too for older iOS).
- Fix the `<link rel="icon" href="/favicon.png">` → point to a file that actually exists (`/favicon.ico`, or whichever icon is in `public/`). I'll verify which exists before editing.

## Out of scope

- No new dependencies, no `vite-plugin-pwa`, no Vite config changes.
- No edits to `main.tsx`'s existing chunk-reload recovery — it stays as the second line of defence for chunk failures **after** boot.
- No backend / edge-function / Supabase changes — purely a hosting/cache problem.

## Verification

1. Republish after the change.
2. In a normal browser that's currently broken: one visit should auto-recover (you may see a half-second flash as the guard reloads), then load cleanly. No more hard-refresh needed.
3. DevTools → Application → Service Workers on `mycollectai.com` shows **no** registered worker after the recovery visit.
4. Console is clean — no manifest/favicon 404s, no MIME-type CSS error.

## Files touched

- `public/sw.js` — reorder `activate`.
- `index.html` — add inline guard, remove dead PWA tags, fix icon, swap deprecated meta.

Approve to implement.
