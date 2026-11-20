import { test } from "node:test";
import assert from "node:assert/strict";
import { requiredSides, canSubmit, canGrade } from "./scanPhotos.ts";

test("price check needs only the front", () => {
  assert.deepEqual(requiredSides("price"), ["front"]);
  assert.equal(canSubmit("price", "card", ["front"]), true);
});
test("collection scan needs front and back", () => {
  assert.equal(canSubmit("collection", "card", ["front"]), false);
  assert.equal(canSubmit("collection", "card", ["front", "back"]), true);
});
test("insight scan needs front and back", () => {
  assert.equal(canSubmit("insight", "card", ["back"]), false);
  assert.equal(canSubmit("insight", "card", ["front", "back"]), true);
});
test("slabs need front and back in collection mode", () => {
  assert.equal(canSubmit("collection", "slab", ["front"]), false);
});
test("sealed products are unchanged", () => {
  assert.equal(canSubmit("collection", "sealed", ["front"]), true);
});
test("grading needs both stored photos", () => {
  assert.equal(canGrade({ image_url: "a.jpg", back_image_url: null }), false);
  assert.equal(canGrade({ image_url: "a.jpg", back_image_url: "b.jpg" }), true);
});
