import { assertEquals } from "jsr:@std/assert@1";
import { crossCheck, lowerConfidence, pcHeadline, rungForGrade, ladderGradedEstimates, NO_PC_GRADE_NOTE } from "./pcValuation.ts";

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
