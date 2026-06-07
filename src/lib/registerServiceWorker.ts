const PREVIEW_HOST_PATTERNS = [
  /^id-preview--/,
  /^preview--/,
  /(^|\.)lovableproject\.com$/,
  /(^|\.)lovableproject-dev\.com$/,
  /(^|\.)beta\.lovable\.dev$/,
];

function isPreviewHost(hostname: string) {
  return PREVIEW_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function shouldBlockAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return isPreviewHost(window.location.hostname);
}

async function unregisterAppServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js") || registration.scope === `${window.location.origin}/`)
        .map((registration) => registration.unregister()),
    );
  } catch {
    // Keep app boot resilient when browser privacy settings block SW APIs.
  }
}

export async function registerServiceWorker() {
  if (shouldBlockAppServiceWorker()) {
    await unregisterAppServiceWorkers();
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      registration.update();
    } catch {
      // The app must remain usable even if PWA registration fails.
    }
  });
}