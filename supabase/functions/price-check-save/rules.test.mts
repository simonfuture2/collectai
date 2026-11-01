import { test } from "node:test";
import assert from "node:assert/strict";
import { priceOnlyCardRow } from "./rules.ts";

test("ungraded price fills both estimates", () => {
  const r = priceOnlyCardRow("u", "u/a.jpg", { productId: 7, name: "Charizard [Holo] #4", set: "Base", number: "4", ladder: { ungraded: 300, psa10: 9000 } }, {}, "t");
  assert.equal(r.estimated_value_low, 300); assert.equal(r.estimated_value_high, 300);
  assert.equal(r.variant, "Holo"); assert.equal(r.card_name, "Charizard");
  assert.equal(r.analysis_depth, "price_only"); assert.equal(r.scan_purpose, "collection");
});

test("no ungraded price leaves estimates null", () => {
  const r = priceOnlyCardRow("u", "u/a.jpg", { productId: 7, name: "X", ladder: { psa10: 50 } }, {}, "t");
  assert.equal(r.estimated_value_low, null); assert.equal(r.estimated_value_high, null);
});
