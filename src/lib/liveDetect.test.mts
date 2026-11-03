import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE, categoryFor, coverageOk, dHash, emaQuad, errorPill, hamming, isDuplicate, nextLanguage,
  orderCorners, quadMotion, scanState, shapeKind, steadyStep, type Quad,
} from "./liveDetect.ts";

test("card shape accepted in portrait and landscape within ±15%, other shapes rejected", () => {
  assert.equal(shapeKind(63, 88), "card");
  assert.equal(shapeKind(88, 63), "card");
  assert.equal(shapeKind(100, 100), null);
  assert.equal(shapeKind(58.5, 100), "slab");
});

test("coverage must be between 12% and 90% of the frame", () => {
  assert.equal(coverageOk(0.11), false);
  assert.equal(coverageOk(0.12), true);
  assert.equal(coverageOk(0.9), true);
  assert.equal(coverageOk(0.91), false);
});

test("corners are ordered tl, tr, br, bl whatever order they arrive in", () => {
  const q = orderCorners([{ x: 10, y: 90 }, { x: 90, y: 10 }, { x: 10, y: 10 }, { x: 90, y: 90 }]);
  assert.deepEqual(q, [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]);
});

test("smoothing moves part of the way and motion measures average corner shift", () => {
  const a: Quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const b = a.map(p => ({ x: p.x + 10, y: p.y })) as Quad;
  const s = emaQuad(a, b, 0.5);
  assert.equal(s[0].x, 5);
  assert.equal(quadMotion(a, b), 10);
});

test("auto-capture fires only after 600 ms of steady, sharp frames", () => {
  let st = steadyStep(null, 1000, true, true);
  assert.equal(st.fire, false);
  st = steadyStep(st.since, 1599, true, true);
  assert.equal(st.fire, false);
  st = steadyStep(st.since, 1600, true, true);
  assert.equal(st.fire, true);
  assert.equal(steadyStep(st.since, 1700, false, true).since, null);
  assert.equal(LIVE.STEADY_MS, 600);
});

test("pill states: searching, move closer under 25% coverage, hold steady, checking", () => {
  assert.equal(scanState({ found: false, coverage: 0, capturing: false }), "searching");
  assert.equal(scanState({ found: true, coverage: 0.2, capturing: false }), "closer");
  assert.equal(scanState({ found: true, coverage: 0.4, capturing: false }), "steady");
  assert.equal(scanState({ found: true, coverage: 0.4, capturing: true }), "capturing");
});

test("duplicate guard blocks hashes within Hamming distance 10", () => {
  const grid = Array.from({ length: 72 }, (_, i) => (i * 37) % 255);
  const h = dHash(grid);
  assert.equal(h.length, 16);
  assert.equal(hamming(h, h), 0);
  assert.equal(isDuplicate(h, h), true);
  const flipped = h.split("").map(c => (15 - parseInt(c, 16)).toString(16)).join("");
  assert.equal(hamming(h, flipped), 64);
  assert.equal(isDuplicate(h, flipped), false);
  assert.equal(isDuplicate(h, null), false);
});

test("game picker maps to existing price-check categories; Auto/Sports/Other send none", () => {
  assert.equal(categoryFor("pokemon"), "pokemon-cards");
  assert.equal(categoryFor("dragonball"), "dragon-ball-cards");
  assert.equal(categoryFor("auto"), undefined);
  assert.equal(categoryFor("sports"), undefined);
});

test("language button cycles Any → English → Japanese → Korean → Chinese → Any", () => {
  assert.equal(nextLanguage("any"), "english");
  assert.equal(nextLanguage("korean"), "chinese");
  assert.equal(nextLanguage("chinese"), "any");
});

test("errors read in plain words; only the hourly limit needs a tap to resume", () => {
  assert.deepEqual(errorPill(429), { text: "You've hit 100 scans this hour – back in a few minutes", hardPause: true });
  assert.equal(errorPill(422).text, "Couldn't read that card – try less glare");
  assert.equal(errorPill(503).text, "Busy – trying again");
});
