import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE, categoryFor, coverageOk, dHash, emaQuad, errorPill, hamming, isDuplicate, nextLanguage,
  orderCorners, quadMotion, scanState, shapeKind, steadyStep, cooldownDone, trackPhase, showIdleHint, loopPaused, type Quad,
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
  assert.deepEqual(errorPill(429), { text: "You've hit 100 scans this hour – tap play to resume later", hardPause: true });
  assert.equal(errorPill(422).text, "Couldn't read that card – try less glare");
  assert.equal(errorPill(503).text, "Busy – trying again");
});

test("auto capture fires after 600 ms steady and sharp", () => {
  const a = steadyStep(null, 0, true, true);
  assert.equal(steadyStep(a.since, 599, true, true).fire, false);
  assert.equal(steadyStep(a.since, 600, true, true).fire, true);
});

test("blurry but still card still fires after the grace period", () => {
  const a = steadyStep(null, 0, true, false);
  assert.equal(steadyStep(a.since, 600, true, false).fire, false);
  assert.equal(steadyStep(a.since, LIVE.SHARP_GRACE_MS, true, false).fire, true);
});

test("cooldown ends when the card leaves for 400 ms", () => {
  assert.equal(cooldownDone({ now: 1399, lastSeen: 1000, hashDist: 0 }), null);
  assert.equal(cooldownDone({ now: 1400, lastSeen: 1000, hashDist: 0 }), "left");
});

test("cooldown ends when a different card appears (distance over 10), not the same card", () => {
  assert.equal(cooldownDone({ now: 1000, lastSeen: 1000, hashDist: 10 }), null);
  assert.equal(cooldownDone({ now: 1000, lastSeen: 1000, hashDist: 11 }), "new");
});

test("same card held still never leaves cooldown", () => {
  for (let t = 0; t < 10_000; t += 100) assert.equal(cooldownDone({ now: t, lastSeen: t, hashDist: 2 }), null);
});

test("error pause is 2 seconds and result shows for 1.2 seconds", () => {
  assert.equal(LIVE.ERROR_PAUSE_MS, 2000);
  assert.equal(LIVE.RESULT_MS, 1200);
});

test("loop pauses only while capturing/checking or before the camera is ready", () => {
  for (const p of ["capturing", "checking", "idle"] as const) assert.equal(loopPaused(p), true);
  for (const p of ["searching", "tracking", "steady", "result", "cooldown", "error"] as const) assert.equal(loopPaused(p), false);
});

test("track phase and idle hint after 4 s", () => {
  assert.equal(trackPhase(false, 0), "searching");
  assert.equal(trackPhase(true, 0.1), "tracking");
  assert.equal(trackPhase(true, 0.4), "steady");
  assert.equal(showIdleHint(true, "searching", 4000, 0, 0), true);
  assert.equal(showIdleHint(true, "searching", 3999, 0, 0), false);
  assert.equal(showIdleHint(false, "searching", 9000, 0, 0), false);
});
