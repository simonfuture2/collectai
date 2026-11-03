import { test } from "node:test";
import assert from "node:assert/strict";
import { addToSession, clearSession, patchSession, readSession, removeFromSession, sessionTotal, sessionTray, updateSessionPick, type SessionCheck } from "./priceSession.ts";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const item = (i: number, price: number | null): SessionCheck => ({ priceCheckId: String(i), imagePath: "u/p.jpg", name: `C${i}`, price, at: i });

test("tray is sorted by value high to low, unmatched last", () => {
  assert.deepEqual(sessionTray([item(1, 5), item(2, null), item(3, 50)]).map(i => i.priceCheckId), ["3", "1", "2"]);
});

test("tray keeps only the last 20 checks", () => {
  const list = Array.from({ length: 25 }, (_, i) => item(i, 1000 - i));
  const tray = sessionTray(list);
  assert.equal(tray.length, 20);
  assert.ok(!tray.some(i => Number(i.priceCheckId) < 5));
});

test("adding the same check replaces it, and a new pick updates its price", () => {
  const s = mem();
  addToSession(item(1, 5), s); addToSession(item(1, 6), s);
  assert.equal(readSession(s).length, 1);
  updateSessionPick("1", "New", 99, s);
  assert.equal(readSession(s)[0].price, 99);
});

test("removing a check drops only that card, and clear empties the stack", () => {
  const s = mem();
  addToSession(item(1, 5), s); addToSession(item(2, 7), s);
  removeFromSession("1", s);
  assert.deepEqual(readSession(s).map(i => i.priceCheckId), ["2"]);
  clearSession(s);
  assert.equal(readSession(s).length, 0);
});

test("total value sums raw prices and ignores unmatched cards", () => {
  assert.equal(sessionTotal([item(1, 5), item(2, null), item(3, 12.5)]), 17.5);
});

test("optional fields survive a refresh and can be patched", () => {
  const s = mem();
  addToSession({ ...item(1, 5), number: "4", set: "Base", parallel: "Holo", language: "japanese", candidateCount: 3 }, s);
  patchSession("1", { savedCardId: "card-1" }, s);
  const [r] = readSession(s);
  assert.equal(r.parallel, "Holo"); assert.equal(r.candidateCount, 3); assert.equal(r.savedCardId, "card-1");
});
