import { assertEquals } from "jsr:@std/assert@1";
import { liveRefreshDue, refreshDecision, crossCheck, lowerConfidence, pcHeadline, rungForGrade, ladderGradedEstimates, NO_PC_GRADE_NOTE } from "./pcValuation.ts";

Deno.test("headline is PriceCharting value ±10%", () => {
  assertEquals(pcHeadline({ ungraded: 100 }, "ungraded"), { value: 100, low: 90, high: 110 });
  assertEquals(pcHeadline({ ungraded: 100 }, "psa10"), null);
});

Deno.test("grade rungs map to PriceCharting keys", () => {
  assertEquals(rungForGrade(null, null), "ungraded");
  assertEquals(rungForGrade("PSA", 9), "grade9"); // graded-price
  assertEquals(rungForGrade("PSA", 10), "psa10"); // manual-only
  assertEquals(rungForGrade("BGS", 10), "bgs10");
  assertEquals(rungForGrade("TAG", 10), "tag10"); // condition-21
  assertEquals(rungForGrade("PSA", 8.5), null);
});

Deno.test("cross-check flags only gaps over 25%", () => {
  assertEquals(crossCheck(100, 125)?.flagged, false);
  assertEquals(crossCheck(100, 126)?.flagged, true);
  assertEquals(crossCheck(100), null);
});

Deno.test("confidence drops one step", () => {
  assertEquals(lowerConfidence("high"), "medium");
  assertEquals(lowerConfidence("medium"), "low");
});

Deno.test("missing rung gets the no-data note, never a multiplier", () => {
  const g = ladderGradedEstimates({ ungraded: 50, psa10: 400 });
  assertEquals(g.psa["10"], { value: 400 });
  assertEquals(g.psa["9"], { value: null, note: NO_PC_GRADE_NOTE });
});

Deno.test("refresh: price-only card at $100 becomes $90-$110", () => {
  const d = refreshDecision({ analysis_depth: "price_only" }, { ungraded: 100 });
  assertEquals(d, { revalue: true, rung: "ungraded", value: 100, low: 90, high: 110 });
});

Deno.test("refresh: eBay-valued full card keeps its value", () => {
  assertEquals(refreshDecision({ analysis_depth: "full", ai_analysis: { valuationSource: "ebay" } }, { ungraded: 100 }).revalue, false);
});

Deno.test("refresh: missing rung means no change", () => {
  const d = refreshDecision({ analysis_depth: "full", ai_analysis: { valuationSource: "pricecharting", pcRung: "psa10" } }, { ungraded: 100 });
  assertEquals(d.revalue, false);
});

Deno.test("live refresh at most every 7 days", () => {
  const now = new Date("2026-11-08T00:00:00Z");
  assertEquals(liveRefreshDue("2026-11-02T00:00:00Z", now), false); // 6 days
  assertEquals(liveRefreshDue("2026-10-31T00:00:00Z", now), true); // 8 days
  assertEquals(liveRefreshDue(null, now), true);
});
