/**
 * Build-time validation for the Product JSON-LD emitted on marketplace
 * listing pages. Runs the pure builder against representative fixtures,
 * checks JSON-serializability and required schema.org fields, and fails
 * the build with a clear message if anything is missing or malformed.
 */
import {
  buildProductJsonLd,
  PRODUCT_JSONLD_REQUIRED_FIELDS,
  PRODUCT_JSONLD_REQUIRED_OFFER_FIELDS,
  type CardLike,
  type ListingLike,
} from "../src/lib/seo/productJsonLd";

interface Fixture {
  name: string;
  listing: ListingLike;
  card: CardLike;
  imgUrl?: string | null;
}

const fixtures: Fixture[] = [
  {
    name: "fully populated listing with AI analysis",
    listing: { id: "abc-123", price: 199.5, payment_token: "USDC", chain: "solana" },
    card: {
      card_name: "Charizard",
      card_set: "Base Set",
      card_year: 1999,
      rarity: "Holo Rare",
      condition_grade: "PSA 9",
      authentiseal_serial: "AS-001",
      category: "Pokémon",
      ai_analysis: { summary: "Excellent centering and sharp corners; minor edge wear." },
    },
    imgUrl: "https://example.com/img.jpg",
  },
  {
    name: "minimal listing without card metadata",
    listing: { id: "min-1", price: "10", payment_token: "USDT" },
    card: {},
    imgUrl: null,
  },
  {
    name: "listing without AI analysis but with grade",
    listing: { id: "x-9", price: 42, payment_token: "USDC", chain: "ethereum" },
    card: { card_name: "Pikachu Illustrator", condition_grade: "BGS 8.5", category: "Pokémon" },
  },
];

const errors: string[] = [];

for (const f of fixtures) {
  const ld = buildProductJsonLd(f.listing, f.card, f.imgUrl);

  // 1. JSON validity round-trip.
  let serialized: string;
  try {
    serialized = JSON.stringify(ld);
    JSON.parse(serialized);
  } catch (e) {
    errors.push(`[${f.name}] not JSON-serializable: ${(e as Error).message}`);
    continue;
  }

  // 2. Required top-level fields.
  for (const key of PRODUCT_JSONLD_REQUIRED_FIELDS) {
    const v = (ld as Record<string, unknown>)[key];
    if (v === undefined || v === null || v === "") {
      errors.push(`[${f.name}] missing required field "${key}"`);
    }
  }

  // 3. Schema.org type assertions.
  if (ld["@context"] !== "https://schema.org") {
    errors.push(`[${f.name}] @context must be "https://schema.org", got ${JSON.stringify(ld["@context"])}`);
  }
  if (ld["@type"] !== "Product") {
    errors.push(`[${f.name}] @type must be "Product", got ${JSON.stringify(ld["@type"])}`);
  }

  // 4. Description length sanity (Google recommends ≤ 160 chars for snippets).
  if (typeof ld.description !== "string" || ld.description.length === 0) {
    errors.push(`[${f.name}] description must be a non-empty string`);
  } else if (ld.description.length > 160) {
    errors.push(`[${f.name}] description exceeds 160 chars (${ld.description.length})`);
  }

  // 5. Offer block.
  const offers = ld.offers as Record<string, unknown> | undefined;
  if (!offers || typeof offers !== "object") {
    errors.push(`[${f.name}] missing offers object`);
  } else {
    for (const key of PRODUCT_JSONLD_REQUIRED_OFFER_FIELDS) {
      const v = offers[key];
      if (v === undefined || v === null || v === "") {
        errors.push(`[${f.name}] missing offers.${key}`);
      }
    }
    if (typeof offers.price === "string" && !/^\d+(\.\d{1,2})?$/.test(offers.price)) {
      errors.push(`[${f.name}] offers.price must be a numeric string, got "${offers.price}"`);
    }
    if (typeof offers.url === "string" && !/^https?:\/\//.test(offers.url)) {
      errors.push(`[${f.name}] offers.url must be an absolute URL, got "${offers.url}"`);
    }
  }
}

if (errors.length > 0) {
  console.error("\n❌ Product JSON-LD validation failed for marketplace listings:\n");
  for (const e of errors) console.error("  - " + e);
  console.error(
    "\nFix src/lib/seo/productJsonLd.ts (or its consumers in src/pages/MarketplaceListing.tsx)\n" +
      "so every listing emits a valid schema.org Product object before publishing.\n",
  );
  process.exit(1);
}

console.log(`✓ Product JSON-LD valid across ${fixtures.length} marketplace fixtures.`);
