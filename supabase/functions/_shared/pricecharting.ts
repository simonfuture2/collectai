// Shared helper: query PriceCharting Prices API for a trading card and return
// a normalized result. Degrades gracefully — never throws.
//
// Docs: https://www.pricecharting.com/api-documentation
// - Auth via ?t=<API_KEY>
// - All prices are integer pennies
// - No historical sales endpoint (do not call /api/sales — it does not exist)
// - For cards, generic video-game field names are reused. See mapping below.

export type CardId = {
  card_name?: string;
  card_number?: string;
  card_set?: string;
  card_year?: string;
  variant?: string;
  rarity?: string;
};

export type GradedPrices = {
  psa7?: number;
  psa8?: number;
  psa9?: number;
  psa10?: number;
  bgs95?: number;
  bgs10?: number;
  cgc10?: number;
  sgc10?: number;
};

export type PriceChartingResult = {
  matched: boolean;
  productName?: string;
  consoleName?: string;
  productId?: string;
  marketValue?: number; // raw / ungraded, in dollars
  gradedPrices?: GradedPrices;
  recentSales: []; // API does not expose this — always empty
  source: "pricecharting";
  fetchedAt: string;
  reason?: string;
};

const BASE_URL = "https://www.pricecharting.com";
const TIMEOUT_MS = 8000;

function cents(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n) / 100;
}

function emptyResult(reason: string): PriceChartingResult {
  return {
    matched: false,
    recentSales: [],
    source: "pricecharting",
    fetchedAt: new Date().toISOString(),
    reason,
  };
}

function buildQuery(cardId: CardId, includeNumber: boolean): string {
  const parts: string[] = [];
  if (cardId.card_name) parts.push(cardId.card_name);
  if (includeNumber && cardId.card_number) parts.push(cardId.card_number);
  const variant = (cardId.variant || "").trim();
  if (variant && !/^(regular|standard|normal)$/i.test(variant)) parts.push(variant);
  if (cardId.card_set) parts.push(cardId.card_set);
  return parts.filter(Boolean).join(" ").trim();
}

function tokensOf(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function looseMatch(productName: string, cardName: string): boolean {
  const p = tokensOf(productName);
  const c = tokensOf(cardName);
  if (c.size === 0) return true;
  for (const t of c) if (p.has(t)) return true;
  return false;
}

async function fetchProduct(query: string, apiKey: string): Promise<any | null> {
  const url = `${BASE_URL}/api/product?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      console.error("[pricecharting] HTTP", res.status, "for query", query);
      return null;
    }
    const data = await res.json();
    if (data?.status !== "success") {
      console.warn("[pricecharting] non-success status for query", query, data?.["error-message"]);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[pricecharting] fetch error", (err as Error)?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractGradedPrices(p: any): GradedPrices {
  const out: GradedPrices = {};
  // Card-meaning mapping per PriceCharting docs:
  // loose-price = Ungraded (raw, used as marketValue)
  // cib-price            = PSA 7 / 7.5
  // new-price            = PSA 8 / BGS 8
  // graded-price         = PSA 9
  // manual-only-price    = PSA 10
  // box-only-price       = BGS 9.5
  // bgs-10-price         = BGS 10
  // condition-17-price   = CGC 10
  // condition-18-price   = SGC 10
  const psa7 = cents(p["cib-price"]);
  const psa8 = cents(p["new-price"]);
  const psa9 = cents(p["graded-price"]);
  const psa10 = cents(p["manual-only-price"]);
  const bgs95 = cents(p["box-only-price"]);
  const bgs10 = cents(p["bgs-10-price"]);
  const cgc10 = cents(p["condition-17-price"]);
  const sgc10 = cents(p["condition-18-price"]);
  if (psa7) out.psa7 = psa7;
  if (psa8) out.psa8 = psa8;
  if (psa9) out.psa9 = psa9;
  if (psa10) out.psa10 = psa10;
  if (bgs95) out.bgs95 = bgs95;
  if (bgs10) out.bgs10 = bgs10;
  if (cgc10) out.cgc10 = cgc10;
  if (sgc10) out.sgc10 = sgc10;
  return out;
}

export async function getPriceChartingData(cardId: CardId): Promise<PriceChartingResult> {
  try {
    const apiKey = Deno.env.get("PRICECHARTING_API_KEY");
    if (!apiKey) {
      console.error("[pricecharting] PRICECHARTING_API_KEY not configured");
      return emptyResult("missing_api_key");
    }
    if (!cardId?.card_name) return emptyResult("missing_card_name");

    const specific = buildQuery(cardId, true);
    let product = specific ? await fetchProduct(specific, apiKey) : null;

    // Validate match; retry once with a looser query (no card number) if weak
    if (!product || !looseMatch(product["product-name"] || "", cardId.card_name)) {
      const broad = buildQuery(cardId, false);
      if (broad && broad !== specific) {
        const retry = await fetchProduct(broad, apiKey);
        if (retry && looseMatch(retry["product-name"] || "", cardId.card_name)) {
          product = retry;
        } else if (!product) {
          product = retry; // last resort
        }
      }
    }

    if (!product) return emptyResult("no_match");
    if (!looseMatch(product["product-name"] || "", cardId.card_name)) {
      return emptyResult("low_confidence_match");
    }

    const marketValue = cents(product["loose-price"]);
    const gradedPrices = extractGradedPrices(product);

    return {
      matched: true,
      productName: product["product-name"],
      consoleName: product["console-name"],
      productId: product.id ? String(product.id) : undefined,
      marketValue,
      gradedPrices: Object.keys(gradedPrices).length ? gradedPrices : undefined,
      recentSales: [],
      source: "pricecharting",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[pricecharting] unexpected error", (err as Error)?.message);
    return emptyResult("unexpected_error");
  }
}
