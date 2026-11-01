import { test } from "node:test";
import assert from "node:assert/strict";
import { PRICE_ONLY_UPGRADE_CREDITS, billingFor, isProAccess } from "./rules.ts";

const now = Date.parse("2026-11-01T12:00:00Z");
const ago = (min: number) => new Date(now - min * 60000).toISOString();

test("price-only upgrade costs one credit", () => {
  assert.equal(PRICE_ONLY_UPGRADE_CREDITS, 1);
  assert.equal(billingFor({ analysis_depth: "price_only", analysis_status: "complete" }, now), "charge");
});
test("re-running a completed analysis is charged", () =>
  assert.equal(billingFor({ analysis_depth: "full", analysis_status: "complete" }, now), "charge"));
test("retrying a failed analysis is free", () =>
  assert.equal(billingFor({ analysis_status: "failed" }, now), "free_retry"));
test("stuck over 10 minutes is a free retry", () =>
  assert.equal(billingFor({ analysis_status: "pricing", analysis_started_at: ago(11) }, now), "free_retry"));
test("in progress under 10 minutes is busy", () =>
  assert.equal(billingFor({ analysis_status: "identifying", analysis_started_at: ago(5) }, now), "busy"));
test("pro or active beta is free; expired beta is not", () => {
  assert.equal(isProAccess({ plan: "pro" }, now), true);
  assert.equal(isProAccess({ plan: "free", beta_access_until: ago(-60) }, now), true);
  assert.equal(isProAccess({ plan: "free", beta_access_until: ago(60) }, now), false);
});
