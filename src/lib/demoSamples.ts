// Precomputed home-page sample results: no API call, never uses a visitor's demo scans.
import pokemon from "@/assets/samples/pokemon.svg";
import onepiece from "@/assets/samples/onepiece.svg";
import sports from "@/assets/samples/sports.svg";
import slab from "@/assets/samples/slab.svg";

export type DemoSample = {
  id: string; label: string; image: string;
  result: {
    cardName: string; cardSet: string; cardNumber: string; conditionGrade: string; gradeNumber: number;
    estimatedValueLow: number; estimatedValueHigh: number; pricedFrom: "market";
  };
};

export const SAMPLE_SCAN_MS = 2000;

export const DEMO_SAMPLES: DemoSample[] = [
  { id: "pokemon", label: "Pokémon", image: pokemon, result: { cardName: "Charizard", cardSet: "Base Set", cardNumber: "4/102", conditionGrade: "Near Mint", gradeNumber: 7, estimatedValueLow: 300, estimatedValueHigh: 450, pricedFrom: "market" } },
  { id: "onepiece", label: "One Piece", image: onepiece, result: { cardName: "Monkey.D.Luffy", cardSet: "Romance Dawn", cardNumber: "OP01-024", conditionGrade: "Near Mint", gradeNumber: 8, estimatedValueLow: 20, estimatedValueHigh: 35, pricedFrom: "market" } },
  { id: "sports", label: "Sports", image: sports, result: { cardName: "Michael Jordan", cardSet: "1990 Fleer", cardNumber: "26", conditionGrade: "Excellent", gradeNumber: 6, estimatedValueLow: 15, estimatedValueHigh: 30, pricedFrom: "market" } },
  { id: "slab", label: "Graded slab", image: slab, result: { cardName: "Pikachu Illustrator", cardSet: "PSA 9 · CoroCoro Promo", cardNumber: "Promo", conditionGrade: "Mint", gradeNumber: 9, estimatedValueLow: 1_500_000, estimatedValueHigh: 2_500_000, pricedFrom: "market" } },
];
