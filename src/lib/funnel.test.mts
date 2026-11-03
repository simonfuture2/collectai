import { test } from "node:test";
import assert from "node:assert/strict";
import { countsByRef, funnelSteps } from "./funnel.ts";
import { fitWithin, isFresh, DEMO_CARD_TTL_MS } from "./demoCard.ts";

const rows = [
  { ref_code: "direct", event_type: "landing_view", events: 120, people: 100 },
  { ref_code: "ig_1", event_type: "landing_view", events: 10, people: 10 },
  { ref_code: "direct", event_type: "demo_result", events: 30, people: 20 },
  { ref_code: "direct", event_type: "signup", events: 5, people: 5 },
];

test("funnel converts landing_view → demo_result → signup → first_scan using people", () => {
  const s = funnelSteps(rows);
  assert.deepEqual(s.map(x => x.people), [110, 20, 5, 0]);
  assert.equal(s[0].rate, null);
  assert.equal(s[1].rate, 18.2);
  assert.equal(s[2].rate, 25);
  assert.equal(s[3].rate, 0);
});

test("funnel can be split by ref, and a zero step gives no rate", () => {
  const s = funnelSteps(rows, "ig_1");
  assert.deepEqual(s.map(x => x.people), [10, 0, 0, 0]);
  assert.equal(s[2].rate, null);
});

test("event counts are split by ref with direct first", () => {
  const t = countsByRef(rows);
  assert.deepEqual(t.refs, ["direct", "ig_1"]);
  assert.equal(t.rows.find(r => r.event === "landing_view")!.total, 130);
});

test("a saved demo card is imported only within 24 hours", () => {
  const now = 1_000_000_000;
  assert.equal(isFresh(now - DEMO_CARD_TTL_MS + 1, now), true);
  assert.equal(isFresh(now - DEMO_CARD_TTL_MS, now), false);
  assert.equal(isFresh(now + 5, now), false);
});

test("demo photo is downscaled to at most 1600 px and never upscaled", () => {
  assert.deepEqual(fitWithin(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 });
});
