import { test } from "node:test";
import assert from "node:assert/strict";
import { gradedChips, ungradedPrice, parallelOf } from "./priceLadder.ts";

test("graded chips map PSA 9/10, BGS 9.5/10, CGC 10, TAG 10 and skip missing ones", () => {
  const chips = gradedChips({ ungraded: 5, grade9: 40, psa10: 200, grade9_5: 60, tag10: 90, sgc10: 70 });
  assert.deepEqual(chips.map(c => c.label), ["PSA 9", "PSA 10", "BGS 9.5", "TAG 10"]);
  assert.equal(chips[1].value, 200);
});

test("no ungraded price means null, never an invented number", () => {
  assert.equal(ungradedPrice({ psa10: 100 }), null);
  assert.equal(ungradedPrice({ ungraded: 0 }), null);
  assert.equal(ungradedPrice(null), null);
  assert.equal(ungradedPrice({ ungraded: 12.5 }), 12.5);
});

test("parallel is read from brackets in the product name", () => {
  assert.equal(parallelOf("Charizard [Reverse Holo] #4"), "Reverse Holo");
  assert.equal(parallelOf("Pikachu #25"), null);
});

test("slab hero uses only its own grade", async () => {
  const { slabHero, languageChip } = await import("./priceLadder.ts");
  assert.deepEqual(slabHero({ ungraded: 5, psa10: 100 }, "psa10"), { rung: "psa10", value: 100 });
  assert.deepEqual(slabHero({ ungraded: 5 }, "grade9"), { rung: "grade9", value: null });
  assert.equal(slabHero({ ungraded: 5 }, null), null);
  assert.equal(languageChip("korean"), "Korean");
});
