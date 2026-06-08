// Shared helper: PriceCharting product + price lookup for identified trading cards.
// Degrades gracefully — never throws. On any failure returns { matched: false, ... }.

export type CardId = {
  card_name?: string;
  card_number?: string;
  card_set?: string;
  card_year?: string;
  variant?: string;
  rarity?: string;
};

export type RecentSale = {
  price: number;          // dollars
  date: string;           // ISO or raw string from API
  grade: string;
  certId: string;
};

export type PriceChartingResult = {
  matched: boolean;
  productName?: string;
  productId?: string;
  marketValue?: number;                       // raw / ungraded, dollars
  gradedPrices?: Record<string, number>;      // e.g. { psa10: 1234.56, psa9: 456.78, bgs95: ... }
  recentSales?: RecentSale[];
  source: "pricecharting";
  fetchedAt: string;
  reason?: string;                            // present when matched=false, for diagnostics
};

const BASE = "https://www.pricecharting.com/api";

// PriceCharting returns integer cents — convert to dollars (2dp).
function centsToDollars(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n) / 100;
}

function buildQuery(card: CardId): string {
  const parts = [
    card.card_year,
    card.card_set,
    card.card_name,
    card.card_number,
    card.variant && !/^regular$/i.test(card.variant) ? card.variant : "",
  ]
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean);
  return parts.join(" ");
}

function unmatched(reason: string): PriceChartingResult {
  return {
    matched: false,
    source: "pricecharting",
    fetchedAt: new Date().toISOString(),
    reason,
  };
}

async function fetchProduct(apiKey: string, query: string): Promise<any | null> {
  const url = `${BASE}/product?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    console.error("[pricecharting] product HTTP", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = await res.json().catch(() => null);
  if (!data || data.status !== "success" || !data.id) return null;
  return data;
}

async function fetchRecentSales(apiKey: string, productId: string): Promise<RecentSale[]> {
  try {
    const url = `${BASE}/sales?t=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(productId)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const rows: any[] = Array.isArray(data?.sales) ? data.sales : Array.isArray(data) ? data : [];
    return rows
      .map((s) => ({
        price: centsToDollars(s?.price ?? s?.sale_price) ?? 0,
        date: String(s?.date ?? s?.sale_date ?? ""),
        grade: String(s?.grade ?? s?.condition ?? ""),
        certId: String(s?.cert_id ?? s?.certification ?? s?.certId ?? ""),
      }))
      .filter((s) => s.price > 0)
      .slice(0, 25);
  } catch (err) {
    console.error("[pricecharting] sales error", err);
    return [];
  }
}

function extractGradedPrices(p: any): Record<string, number> {
  // PriceCharting fields use prefixes like manual-only-price, graded-price, bgs-10-price, etc.
  // Map common ones to a normalized dictionary.
  const map: Array<[string, string[]]> = [
    ["psa10", ["psa-10-price", "manual-only-price"]],   // manual-only often = PSA 10 for cards
    ["psa9",  ["graded-price"]],                         // "graded" ≈ PSA 9 in PC schema
    ["psa8",  ["box-only-price"]],                       // PC reuses this slot for PSA 8 on cards
    ["bgs10", ["bgs-10-price"]],
    ["cgc10", ["cgc-10-price"]],
    ["sgc10", ["sgc-10-price"]],
  ];
  const out: Record<string, number> = {};
  for (const [key, sources] of map) {
    for (const f of sources) {
      const v = centsToDollars(p?.[f]);
      if (v && v > 0) { out[key] = v; break; }
    }
  }
  return out;
}

export async function getPriceChartingData(cardId: CardId): Promise<PriceChartingResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const apiKey = Deno.env.get("PRICECHARTING_API_KEY");
    if (!apiKey) {
      console.error("[pricecharting] PRICECHARTING_API_KEY not configured");
      return unmatched("missing_api_key");
    }

    const query = buildQuery(cardId);
    if (!query) return unmatched("empty_query");

    const product = await fetchProduct(apiKey, query);
    if (!product) {
      // Retry with a looser query (no card number) if first attempt failed
      const loose = buildQuery({ ...cardId, card_number: "" });
      const fallback = loose !== query ? await fetchProduct(apiKey, loose) : null;
      if (!fallback) return unmatched("no_product_match");
      return await assemble(apiKey, fallback, fetchedAt);
    }

    return await assemble(apiKey, product, fetchedAt);
  } catch (err) {
    console.error("[pricecharting] unexpected error", err);
    return {
      matched: false,
      source: "pricecharting",
      fetchedAt,
      reason: "exception",
    };
  }
}

async function assemble(
  apiKey: string,
  product: any,
  fetchedAt: string,
): Promise<PriceChartingResult> {
  const productId = String(product.id);
  const marketValue =
    centsToDollars(product["loose-price"]) ??
    centsToDollars(product["used-price"]) ??
    centsToDollars(product["ungraded-price"]);
  const gradedPrices = extractGradedPrices(product);
  const recentSales = await fetchRecentSales(apiKey, productId);

  return {
    matched: true,
    productId,
    productName: String(product["product-name"] ?? product.name ?? ""),
    marketValue,
    gradedPrices,
    recentSales,
    source: "pricecharting",
    fetchedAt,
  };
}
