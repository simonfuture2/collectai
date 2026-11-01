import { assertEquals } from "jsr:@std/assert@1";
import { accuracy, groupParallels, languageBoost, normLanguage, parallelLabel, slabRung } from "./ranking.ts";

Deno.test("slab grade maps to its ladder rung", () => {
  assertEquals(slabRung({ company: "PSA", grade: 10 }), "psa10");
  assertEquals(slabRung({ company: "PSA", grade: "9" }), "grade9");
  assertEquals(slabRung({ company: "BGS", grade: 10 }), "bgs10");
  assertEquals(slabRung({ company: "TAG", grade: 10 }), "tag10");
  assertEquals(slabRung(null), null);
});

Deno.test("Japanese/Korean text prefers Japanese products", () => {
  assertEquals(languageBoost(normLanguage("Japanese"), "Charizard #6", "Pokemon Japanese Base"), 15);
  assertEquals(languageBoost(normLanguage("korean"), "Charizard #4", "Pokemon Base Set"), -10);
  assertEquals(languageBoost(normLanguage("english"), "Charizard #4", "Pokemon Base Set"), 0);
});

Deno.test("parallels of the same card sit together", () => {
  const out = groupParallels([
    { name: "Charizard #4", number: "4", score: 90 },
    { name: "Blastoise #2", number: "2", score: 60 },
    { name: "Charizard [1st Edition] #4", number: "4", score: 50 },
  ]);
  assertEquals(out.map((c) => c.name), ["Charizard #4", "Charizard [1st Edition] #4", "Blastoise #2"]);
  assertEquals(parallelLabel("Charizard [Reverse Holo] #4"), "Reverse Holo");
});

Deno.test("accuracy counts #1 and top 3", () => {
  assertEquals(accuracy([null, 1, 2, 4]), { total: 4, top1: 50, top3: 75 });
  assertEquals(accuracy([0]), { total: 1, top1: 0, top3: 0 });
});
