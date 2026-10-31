import { assertEquals } from "jsr:@std/assert@1";
import { normalizeLadder } from "./pricecharting.ts";

Deno.test("normalizeLadder maps API keys to grades in dollars", () => {
  const l = normalizeLadder({
    "loose-price": 1234, "condition-9-price": 100, "condition-16-price": 600,
    "cib-price": 700, "new-price": 800, "graded-price": 900, "box-only-price": 950,
    "manual-only-price": 10000, "bgs-10-price": 12000, "condition-17-price": 9000,
    "condition-18-price": 8000, "condition-19-price": 15000, "condition-20-price": 20000,
    "condition-21-price": 7000, "condition-22-price": 6000,
  });
  assertEquals(l.ungraded, 12.34);
  assertEquals(l.grade1, 1);
  assertEquals(l.grade6, 6);
  assertEquals(l.grade7, 7);
  assertEquals(l.grade9_5, 9.5);
  assertEquals(l.psa10, 100);
  assertEquals(l.bgs10, 120);
  assertEquals(l.cgc10_pristine, 150);
  assertEquals(l.bgs10_black, 200);
  assertEquals(l.tag10, 70);
  assertEquals(l.ace10, 60);
});

Deno.test("normalizeLadder reads catalog columns and omits missing values", () => {
  const l = normalizeLadder({ loose_price: 500, condition_13_price: 300, bgs_10_price: 0, new_price: null });
  assertEquals(l, { ungraded: 5, grade3: 3 });
});
