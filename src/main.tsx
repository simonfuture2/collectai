import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";

// Recover from stale-cache chunk load failures (common after a new deploy
// when the service worker is still serving an old index that references
// chunk hashes that no longer exist). Reload once to fetch the new shell.
const RELOAD_KEY = "__chunk_reload__";
function isChunkLoadError(msg: string) {
  return (
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("ChunkLoadError")
  );
}
function tryReloadOnce() {
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  sessionStorage.setItem(RELOAD_KEY, "1");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      Promise.all(regs.map((r) => r.unregister())).finally(() =>
        window.location.reload(),
      );
    });
  } else {
    window.location.reload();
  }
}
window.addEventListener("error", (e) => {
  if (e?.message && isChunkLoadError(e.message)) tryReloadOnce();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e as PromiseRejectionEvent)?.reason?.message ?? "");
  if (isChunkLoadError(msg)) tryReloadOnce();
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
