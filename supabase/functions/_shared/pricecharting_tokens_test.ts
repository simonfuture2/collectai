import { assertEquals } from "jsr:@std/assert@1";
import { tokensOf } from "./pricecharting.ts";

Deno.test("tokensOf keeps Pokémon ex/GX/V suffixes so 'Charizard ex' differs from 'Charizard'", () => {
  assertEquals([...tokensOf("Charizard ex")], ["charizard", "ex"]);
  assertEquals(tokensOf("Pikachu GX").has("gx"), true);
  assertEquals(tokensOf("Mew V").has("v"), true);
  assertEquals(tokensOf("Charizard #4").has("4"), false);
});
