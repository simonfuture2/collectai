import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisCost } from "./analysisCost.ts";

const now = Date.parse("2026-11-01T12:00:00Z");
test("completed card costs 1 credit for free users", () => assert.equal(analysisCost({ analysis_status: "complete" }, false, now), "1 credit"));
test("completed card is free with Pro", () => assert.equal(analysisCost({ analysis_status: "complete" }, true, now), "Free with Pro"));
test("failed analysis retry is free", () => assert.equal(analysisCost({ analysis_status: "failed" }, false, now), "Free retry"));
test("stuck over 10 minutes is a free retry", () =>
  assert.equal(analysisCost({ analysis_status: "pricing", analysis_started_at: new Date(now - 11 * 60000).toISOString() }, false, now), "Free retry"));
