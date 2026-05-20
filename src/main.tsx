import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";

// Recover from stale-cache chunk load failures (common after a new deploy
// when the service worker is still serving an old index that references
// chunk hashes that no longer exist). Clear caches + unregister SW, then
// reload once to fetch the fresh shell.
const RELOAD_KEY = "__chunk_reload__";
const RELOAD_TS_KEY = "__chunk_reload_ts__";

function isChunkLoadError(msg: string) {
  if (!msg) return false;
  return (
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    /\bMIME type\b.*\bmodule\b/i.test(msg)
  );
}

async function nukeCachesAndSW() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* noop */ }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* noop */ }
}

let recovering = false;
async function tryReloadOnce() {
  if (recovering) return;
  recovering = true;

  // Allow one recovery per 60s window to avoid infinite loops
  const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
  const now = Date.now();
  if (sessionStorage.getItem(RELOAD_KEY) && now - last < 60_000) {
    recovering = false;
    return;
  }
  sessionStorage.setItem(RELOAD_KEY, "1");
  sessionStorage.setItem(RELOAD_TS_KEY, String(now));

  await nukeCachesAndSW();
  // Cache-bust the navigation to force a fresh shell
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(now));
  window.location.replace(url.toString());
}

window.addEventListener("error", (e) => {
  const msg = e?.message || String((e as any)?.error?.message ?? "");
  if (isChunkLoadError(msg)) tryReloadOnce();
});
window.addEventListener("unhandledrejection", (e) => {
  const reason: any = (e as PromiseRejectionEvent)?.reason;
  const msg = String(reason?.message ?? reason ?? "");
  if (isChunkLoadError(msg)) tryReloadOnce();
});

// Clear the one-shot flag once the app successfully boots
window.addEventListener("load", () => {
  setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 5_000);
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
