# Fix: Collection & Card Detail pages fail to load

## What's actually happening

The console error `TypeError: Importing a module script failed.` is a **stale bundle** error, not a code bug:

- `Collection` and `CardDetail` are `React.lazy()` routes (see `src/App.tsx`)
- Your browser is loading an old cached `index.html` that references chunk hashes from a previous deploy (`index-DGV3s333.js`)
- Those chunk files no longer exist on the server, so the dynamic `import()` rejects
- The page goes blank and subsequent edge function calls fail with `Load failed`

Root cause: an old `/sw.js` (PWA service worker) registered on a previous visit is still alive on the preview host and keeps serving the stale HTML shell. The current recovery in `main.tsx` reloads once but the SW re-serves the same stale shell, so the loop short-circuits after the 60-second guard.

## Fix

### 1. `public/sw.js` — add a self-destructing tombstone
Ship a tiny service worker at `/sw.js` whose only job is to unregister itself and clear all caches on activation. Any browser still bound to the old SW will fetch this new one, run it, and free itself permanently. After that, no SW is in the way of fresh deploys.

### 2. `vite.config.ts` — stop VitePWA from generating a competing sw.js
Switch `VitePWA` to `selfDestroying: true` (built-in option) so the plugin emits *its own* unregister-only SW and skips precaching. This guarantees Vite never overwrites our tombstone with a precaching SW again. Keep the manifest so the app stays installable, but no offline cache.

### 3. `src/lib/registerServiceWorker.ts` — always unregister, never register
Strip the "register on prod" branch. The only job now is `unregisterAppServiceWorkers()` on every boot (preview, prod, installed PWA alike) until we intentionally bring back a real SW later.

### 4. `src/main.tsx` — harden the one-shot reload
- Bump the cache-bust query so any cached HTML is bypassed: add `?_r=<ts>&_sw=0`
- Before reloading, also call `navigator.serviceWorker.controller?.postMessage({type:'SKIP_WAITING'})` and `window.location.reload()` with `true`-equivalent (replace + bust)
- Remove the 60-second short-circuit when the error is a chunk-load error and no SW is registered after cleanup — that case is safe to retry

### 5. `index.html` — add `<meta http-equiv="Cache-Control" content="no-cache">`
Forces the HTML shell to revalidate on every navigation so a freshly deployed `index.html` is picked up immediately, not served from disk cache.

## Why not just "hard refresh"
A hard refresh fixes it for *you* once, but every other user who already visited the site has the old SW too. The tombstone SW fixes them on their next visit without any action.

## Out of scope
- Re-introducing real offline/PWA caching (can be added back later with a proper versioned SW)
- Any edge-function or DB changes — the `Load failed` errors disappear once the page actually loads

## Files touched
- `public/sw.js` (new)
- `vite.config.ts`
- `src/lib/registerServiceWorker.ts`
- `src/main.tsx`
- `index.html`
