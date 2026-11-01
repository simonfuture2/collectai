import { test } from "node:test";
import assert from "node:assert/strict";
import { goNoGo, parseLabels, percentile, rankOf, summarize, toCsv, type LabItem, type LabResult } from "./priceCheckLab.ts";

const item = (id: string, game: string): LabItem => ({ id, game, file_name: `${id}.jpg`, image_path: `u/${id}.jpg`, expected_product_id: 1, is_slab: false, is_japanese: false });
const res = (item_id: string, latency_ms: number, rank: number | null, extra: Partial<LabResult> = {}): LabResult =>
  ({ item_id, mode: "price", latency_ms, rank, top_product_id: null, no_match: false, api_calls: 0, error: null, ...extra });

test("median and 90th percentile", () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => x * 1000);
  assert.equal(percentile(v, 50), 5500);
  assert.equal(percentile(v, 90), 9100);
});

test("rank is the 1-based position of the expected product", () => {
  assert.equal(rankOf(42, [7, 42, 9]), 2);
  assert.equal(rankOf(42, [7, 9]), null);
});

test("errors are excluded from accuracy but counted", () => {
  const s = summarize([res("a", 1000, 1), res("b", 2000, 4), res("c", 0, null, { error: "boom" })], 0.002);
  assert.equal(s.errors, 1);
  assert.equal(s.top1Pct, 50);
  assert.equal(s.top3Pct, 50);
});

test("go needs median under 4 s and top-3 >= 90% on the four main TCGs", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((id) => item(id, "pokemon")).concat(item("s", "sports"));
  const good = items.slice(0, 10).map((i) => res(i.id, 3000, 1)).concat(res("s", 3000, null));
  assert.equal(goNoGo(items, good).go, true); // sports miss doesn't count
  const slow = items.slice(0, 10).map((i) => res(i.id, 4000, 1));
  assert.equal(goNoGo(items, slow).speedOk, false); // 4 s exactly fails
  const miss = items.slice(0, 10).map((i, k) => res(i.id, 1000, k < 8 ? 1 : null)); // 80%
  assert.equal(goNoGo(items, miss).accuracyOk, false);
});

test("csv escapes and labels parse", () => {
  const csv = toCsv([item("a", "pokemon")], [res("a", 1000, 1, { error: 'bad, "x"' })]);
  assert.ok(csv.split("\n")[1].endsWith('"bad, ""x"""'));
  const m = parseLabels("Char.JPG, 123, Pokemon, yes, no\nbad,abc");
  assert.deepEqual(m.get("char.jpg"), { productId: 123, game: "pokemon", slab: true, japanese: false });
  assert.equal(m.size, 1);
});
