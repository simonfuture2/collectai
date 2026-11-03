export type SessionCheck = {
  priceCheckId: string; imagePath: string; name: string; price: number | null; at: number;
  number?: string | null; set?: string | null; parallel?: string | null; language?: string | null;
  candidateCount?: number; productId?: number | null; savedCardId?: string | null;
};

const KEY = "pc_session";
export const TRAY_LIMIT = 20;

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const store = (): Store | null => (typeof sessionStorage === "undefined" ? null : sessionStorage);

export function readSession(s: Store | null = store()): SessionCheck[] {
  try { return JSON.parse(s?.getItem(KEY) ?? "[]"); } catch { return []; }
}
const write = (list: SessionCheck[], s: Store | null) => { try { s?.setItem(KEY, JSON.stringify(list.slice(-100))); } catch { /* ignore */ } };

export function addToSession(item: SessionCheck, s: Store | null = store()) {
  write([...readSession(s).filter(i => i.priceCheckId !== item.priceCheckId), item], s);
}

export function updateSessionPick(priceCheckId: string, name: string, price: number | null, s: Store | null = store(), extra: Partial<SessionCheck> = {}) {
  write(readSession(s).map(i => (i.priceCheckId === priceCheckId ? { ...i, ...extra, name, price } : i)), s);
}

export function patchSession(priceCheckId: string, patch: Partial<SessionCheck>, s: Store | null = store()) {
  write(readSession(s).map(i => (i.priceCheckId === priceCheckId ? { ...i, ...patch } : i)), s);
}

export function removeFromSession(priceCheckId: string, s: Store | null = store()) {
  write(readSession(s).filter(i => i.priceCheckId !== priceCheckId), s);
}

export function clearSession(s: Store | null = store()) { write([], s); }

/** Sum of ungraded prices; unmatched cards add nothing. */
export const sessionTotal = (list: SessionCheck[]) => list.reduce((t, i) => t + (i.price ?? 0), 0);

/** Last 20 checks of this session, highest value first; unmatched (no price) last. */
export function sessionTray(list: SessionCheck[]): SessionCheck[] {
  return [...list].sort((a, b) => b.at - a.at).slice(0, TRAY_LIMIT)
    .sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
}
