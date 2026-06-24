export type GradingGuideStatus = "live" | "coming_soon";

export interface GradingGuide {
  slug: string;
  name: string;
  blurb: string;
  status: GradingGuideStatus;
  partnerBadge: boolean;
}

export const GRADING_GUIDES: GradingGuide[] = [
  {
    slug: "tag",
    name: "TAG Grading",
    blurb:
      "Fully automated, AI-driven grading with a 1,000-point precision scale and per-subgrade transparency.",
    status: "live",
    partnerBadge: false,
  },
  {
    slug: "psa",
    name: "PSA",
    blurb:
      "The most recognized name in card grading — the 1–10 PSA scale moves markets for sports and TCG alike.",
    status: "coming_soon",
    partnerBadge: false,
  },
  {
    slug: "bgs",
    name: "Beckett (BGS)",
    blurb:
      "Known for strict subgrades and the coveted Black Label 10. A favorite for modern high-end submissions.",
    status: "coming_soon",
    partnerBadge: false,
  },
  {
    slug: "cgc",
    name: "CGC Cards",
    blurb:
      "Fast turnarounds and trusted by TCG collectors — especially strong for Pokémon and modern releases.",
    status: "coming_soon",
    partnerBadge: false,
  },
  {
    slug: "sgc",
    name: "SGC",
    blurb:
      "Loved by vintage sports collectors for tough, consistent grades and the iconic tuxedo slab.",
    status: "coming_soon",
    partnerBadge: false,
  },
];

export function getGuideBySlug(slug: string): GradingGuide | undefined {
  return GRADING_GUIDES.find((g) => g.slug === slug);
}
