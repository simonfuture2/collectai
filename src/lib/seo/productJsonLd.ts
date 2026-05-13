// Builds schema.org Product JSON-LD for marketplace listings.
// Kept pure & dependency-free so it can be validated at build time.

export interface ListingLike {
  id: string;
  price: number | string;
  payment_token: string;
  chain?: string;
}

export interface CardLike {
  card_name?: string | null;
  card_set?: string | null;
  card_year?: string | number | null;
  rarity?: string | null;
  condition_grade?: string | null;
  authentiseal_serial?: string | null;
  category?: string | null;
  ai_analysis?: Record<string, any> | null;
}

export interface ProductJsonLd {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description: string;
  image?: string;
  category: string;
  offers: {
    "@type": "Offer";
    price: string;
    priceCurrency: string;
    availability: string;
    url: string;
  };
}

export function buildProductJsonLd(
  listing: ListingLike,
  card: CardLike,
  imgUrl?: string | null,
  siteUrl = "https://mycollectai.com",
): ProductJsonLd {
  const ai = (card.ai_analysis ?? {}) as Record<string, any>;
  const aiBlurb = (ai.summary || ai.overview || ai.description || ai.notes || "").toString().trim();
  const descParts = [
    card.condition_grade && `Grade ${card.condition_grade}`,
    card.rarity,
    card.authentiseal_serial && "AuthentiSeal verified",
    aiBlurb,
  ].filter(Boolean) as string[];
  const description = (descParts.join(" — ") ||
    `Buy ${card.card_name ?? "this card"} with on-chain escrow on ${listing.chain ?? "blockchain"}.`).slice(0, 155);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.card_name ?? "Trading card",
    description,
    image: imgUrl ?? undefined,
    category: card.category ?? "Collectible",
    offers: {
      "@type": "Offer",
      price: Number(listing.price).toFixed(2),
      priceCurrency: listing.payment_token,
      availability: "https://schema.org/InStock",
      url: `${siteUrl}/marketplace/${listing.id}`,
    },
  };
}

export const PRODUCT_JSONLD_REQUIRED_FIELDS = [
  "@context",
  "@type",
  "name",
  "description",
  "category",
  "offers",
] as const;

export const PRODUCT_JSONLD_REQUIRED_OFFER_FIELDS = [
  "@type",
  "price",
  "priceCurrency",
  "availability",
  "url",
] as const;
