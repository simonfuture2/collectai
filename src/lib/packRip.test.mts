import { test } from "node:test";
import assert from "node:assert/strict";
import { chaseHit, FULL_ANALYSIS_CREDITS, packSummary, priceOnlyCard, sortedPulls, storedPulls, type PackPull } from "./packRip.ts";
const pull = (id: number, raw: number): PackPull => ({ priceCheckId: String(id), cardName: `Card ${id}`, imagePath: "user/photo.jpg", imagePreview: "blob:preview", selected: { productId: id, name: `Card ${id}`, set: "Set", number: "1", ladder: { ungraded: raw, psa10: 5000 }, url: "https://www.pricecharting.com/game/1" } });
test("pack total and biggest hit use ungraded prices, sorted most valuable first", () => {
  const pulls = [pull(1, 4.25), pull(2, 20)];
  assert.deepEqual(sortedPulls(pulls).map(p => p.priceCheckId), ["2", "1"]);
  assert.deepEqual(packSummary(pulls), { total_value: 24.25, best_pull_name: "Card 2", best_pull_value: 20 });
});
test("chase badges require exact sealed-list product membership, not a high price", () => {
  assert.equal(chaseHit(pull(1, 100), [{ catalogId: 2 }]), false);
  assert.equal(chaseHit(pull(1, 1), [{ catalogId: "1" }]), true);
});
test("free collection additions are complete price-only cards with stored image paths", () => {
  const card = priceOnlyCard(pull(1, 4.25), "user", "id");
  assert.equal(card.analysis_depth, "price_only"); assert.equal(card.analysis_status, "complete");
  assert.equal(card.image_url, "user/photo.jpg"); assert.equal(card.pricecharting_id, 1);
});
test("explicit full analysis costs exactly one credit", () => assert.equal(FULL_ANALYSIS_CREDITS, 1));
test("saving a rip keeps storage paths, never temporary viewing URLs", () => {
  const saved = storedPulls([pull(1, 4)]) as Record<string, unknown>[];
  assert.equal(saved[0].imagePath, "user/photo.jpg"); assert.equal("imagePreview" in saved[0], false);
});