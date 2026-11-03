import { test } from "node:test";
import assert from "node:assert/strict";
import { FX, beamLine, perimeterPoint, pingPong, resultAlpha, shakeOffset, type SQuad } from "./scanFx.ts";

const tilted: SQuad = [{ x: 10, y: 0 }, { x: 110, y: 20 }, { x: 100, y: 160 }, { x: 0, y: 140 }];

test("beam follows the card's perspective, not a flat screen line", () => {
  const [l, r] = beamLine(tilted, 0.5);
  assert.deepEqual(l, { x: 5, y: 70 });   // halfway TL→BL
  assert.deepEqual(r, { x: 105, y: 90 }); // halfway TR→BR
  assert.deepEqual(beamLine(tilted, 0), [tilted[0], tilted[1]]);
  assert.deepEqual(beamLine(tilted, 1), [tilted[3], tilted[2]]);
});

test("one steady down-and-up pass takes 900 ms", () => {
  assert.equal(FX.BEAM_PASS_MS, 900);
  assert.equal(pingPong(0, 900), 0);
  assert.equal(pingPong(450, 900), 1);
  assert.equal(pingPong(900, 900), 0);
});

test("running lights travel clockwise from the top-left corner", () => {
  const sq: SQuad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.deepEqual(perimeterPoint(sq, 0.125), { x: 5, y: 0 });
  assert.deepEqual(perimeterPoint(sq, 0.375), { x: 10, y: 5 });
});

test("error shake lasts 250 ms", () => {
  assert.notEqual(shakeOffset(40), 0);
  assert.equal(shakeOffset(250), 0);
});

test("result fades out over 600 ms after being shown", () => {
  assert.equal(resultAlpha(1000), 1);
  assert.equal(resultAlpha(1500), 0.5);
  assert.equal(resultAlpha(1800), 0);
});
