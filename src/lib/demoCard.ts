// Holds a visitor's demo-scan result + photo in IndexedDB until they sign up, then it's imported once.
export const DEMO_CARD_KEY = "mca-demo-card";
export const DEMO_CARD_TTL_MS = 24 * 60 * 60 * 1000;
export const DEMO_MAX_PX = 1600;
export const DEMO_JPEG_QUALITY = 0.85;

export type DemoCardEntry = { at: number; result: Record<string, unknown>; photo: Blob };

/** Fresh = saved less than 24 hours ago (and not from the future). */
export const isFresh = (at: number, now = Date.now()) => at <= now && now - at < DEMO_CARD_TTL_MS;

/** Size that fits within maxPx on the long side, never upscaling. */
export function fitWithin(w: number, h: number, maxPx = DEMO_MAX_PX) {
  const k = Math.min(1, maxPx / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

const DB = "mca", STORE = "kv";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }).finally(() => db.close()) as Promise<T>;
}

export const saveDemoCard = (e: DemoCardEntry) => tx("readwrite", s => s.put(e, DEMO_CARD_KEY));
export const loadDemoCard = () => tx<DemoCardEntry | undefined>("readonly", s => s.get(DEMO_CARD_KEY)).catch(() => undefined);
export const deleteDemoCard = () => tx("readwrite", s => s.delete(DEMO_CARD_KEY)).catch(() => undefined);

/** Downscale an image URL to a JPEG blob (max 1600 px, quality 0.85). */
export async function downscalePhoto(src: string): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/jpeg", DEMO_JPEG_QUALITY));
  if (!blob) throw new Error("Could not prepare photo");
  return blob;
}
