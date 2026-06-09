// Shared helper: hybrid PriceCharting lookup.
// Resolution order:
//   1) Local pricecharting_catalog table (fast, no rate limit)
//   2) Live PriceCharting /api/product (or sportscardspro.com for sports)
//
// Sports categories always go straight to the live SportsCardsPro API since
// the daily catalog sync doesn't ingest those.
//
// Docs: https://www.pricecharting.com/api-documentation
// - Auth via ?t=<API_KEY>
// - Integer pennies for all price fields
// - No historical sales endpoint exists — recentSales is always []
// - JSON keys match CSV header names, so one normalizer covers both paths.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type CardId = {
  card_name?: string;
  card_number?: string;
  card_set?: string;
  card_year?: string;
  variant?: string;
  rarity?: string;
  category?: string; // e.g. "pokemon-cards", "baseball-cards"; optional
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

export type RecentSale = { price: number; date: string; grade?: string };

export type PriceChartingResult = {
  matched: boolean;
  productName?: string;
  consoleName?: string;
  productId?: string;
  marketValue?: number; // raw / ungraded, in dollars
  gradedPrices?: GradedPrices;
  recentSales: RecentSale[];
  source: "pricecharting";
  fetchedAt: string;
  reason?: string;
  via?: "local" | "api" | "sportscardspro";
};

const PC_BASE = "https://www.pricecharting.com";
const SCP_BASE = "https://www.sportscardspro.com";
const TIMEOUT_MS = 8000;

const SPORTS_CATEGORIES = new Set([
  "baseball-cards",
  "basketball-cards",
  "football-cards",
  "hockey-cards",
  "soccer-cards",
]);

const SPORTS_SET_HINTS = [
  "topps",
  "panini",
  "bowman",
  "upper deck",
  "prizm",
  "donruss",
  "fleer",
  "score",
  "select",
  "optic",
  "mosaic",
  "chronicles",
];

function isSports(cardId: CardId): boolean {
  if (cardId.category && SPORTS_CATEGORIES.has(cardId.category)) return true;
  const blob = `${cardId.card_set ?? ""} ${cardId.variant ?? ""}`.toLowerCase();
  return SPORTS_SET_HINTS.some((h) => blob.includes(h));
}

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

function buildQuery(cardId: CardId, includeNumber: boolean): string {
  const parts: string[] = [];
  if (cardId.card_name) parts.push(cardId.card_name);
  if (includeNumber && cardId.card_number) parts.push(cardId.card_number);
  const variant = (cardId.variant || "").trim();
  if (variant && !/^(regular|standard|normal)$/i.test(variant)) parts.push(variant);
  if (cardId.card_set) parts.push(cardId.card_set);
  return parts.filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------------
// One normalizer for both API JSON rows and catalog DB rows.
// API uses hyphenated keys ("loose-price"); DB uses snake_case ("loose_price").
// We check both. PriceCharting field → card-grade mapping (per docs):
//   loose       → Ungraded (raw, used as marketValue)
//   cib         → PSA 7 / 7.5
//   new         → PSA 8 / BGS 8
//   graded      → PSA 9
//   manual-only → PSA 10
//   box-only    → BGS 9.5
//   bgs-10      → BGS 10
//   condition-17 → CGC 10
//   condition-18 → SGC 10
// ---------------------------------------------------------------------------

function pick(rec: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== "") return rec[k];
  }
  return undefined;
}

function extractGraded(rec: Record<string, unknown>): GradedPrices {
  const out: GradedPrices = {};
  const psa7 = cents(pick(rec, "cib-price", "cib_price"));
  const psa8 = cents(pick(rec, "new-price", "new_price"));
  const psa9 = cents(pick(rec, "graded-price", "graded_price"));
  const psa10 = cents(pick(rec, "manual-only-price", "manual_only_price"));
  const bgs95 = cents(pick(rec, "box-only-price", "box_only_price"));
  const bgs10 = cents(pick(rec, "bgs-10-price", "bgs_10_price"));
  const cgc10 = cents(pick(rec, "condition-17-price", "condition_17_price"));
  const sgc10 = cents(pick(rec, "condition-18-price", "condition_18_price"));
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

function normalize(
  rec: Record<string, unknown>,
  via: "local" | "api" | "sportscardspro",
): PriceChartingResult {
  const productName = String(pick(rec, "product-name", "product_name") ?? "");
  const consoleName = pick(rec, "console-name", "console_name");
  const productId = pick(rec, "id");
  const marketValue = cents(pick(rec, "loose-price", "loose_price"));
  const graded = extractGraded(rec);
  return {
    matched: true,
    productName,
    consoleName: consoleName ? String(consoleName) : undefined,
    productId: productId !== undefined ? String(productId) : undefined,
    marketValue,
    gradedPrices: Object.keys(graded).length ? graded : undefined,
    recentSales: [], // API does not expose historical sales
    source: "pricecharting",
    fetchedAt: new Date().toISOString(),
    via,
  };
}

// ---------------------------------------------------------------------------
// Local lookup
// ---------------------------------------------------------------------------

function getSupabase(): SupabaseClient | null {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    return createClient(url, key);
  } catch {
    return null;
  }
}

// Common Japanese ↔ English Pokémon set-name aliases. AI identification often
// returns a hybrid label like "Team Rocket (Rocket Gang)" while PriceCharting
// console-names use "Pokemon Japanese Rocket Gang". Either side matching wins.
const SET_ALIASES: Array<[RegExp, string[]]> = [
  [/\b(team\s*rocket|rocket\s*gang)\b/i, ["team rocket", "rocket gang"]],
  [/\bneo\s*genesis\b/i, ["neo genesis", "neo 1"]],
  [/\bneo\s*discovery\b/i, ["neo discovery", "neo 2"]],
  [/\bneo\s*revelation\b/i, ["neo revelation", "neo 3"]],
  [/\bneo\s*destiny\b/i, ["neo destiny", "neo 4"]],
  [/\bbase\s*set\s*2\b/i, ["base set 2"]],
  [/\bbase\s*set\b/i, ["base set", "base"]],
  [/\bjungle\b/i, ["jungle"]],
  [/\bfossil\b/i, ["fossil"]],
  [/\bvs\b/i, ["vs"]],
  [/\bweb\b/i, ["web"]],
  [/\bgym\s*heroes?\b/i, ["gym heroes", "gym 1"]],
  [/\bgym\s*challenge\b/i, ["gym challenge", "gym 2"]],
  [/\blegendary\s*collection\b/i, ["legendary collection"]],
  [/\be[\-\s]?reader\b/i, ["e-reader", "expedition", "aquapolis", "skyridge"]],
];

function setAliasTokens(rawSet: string): string[] {
  const tokens = new Set<string>();
  const s = (rawSet || "").toLowerCase();
  for (const [re, aliases] of SET_ALIASES) {
    if (re.test(s)) for (const a of aliases) tokens.add(a);
  }
  // Also include raw alphanumeric tokens from the supplied set label.
  for (const t of s.replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (t.length >= 3) tokens.add(t);
  }
  return [...tokens];
}

// Normalize a card number to a canonical "9" form. Strips "#", leading zeros,
// and "/total" suffixes ("9/82" → "9", "009" → "9", "#9" → "9").
function normalizeCardNumber(n: string): string {
  if (!n) return "";
  const cleaned = n.replace(/^#/, "").split("/")[0].trim();
  const m = cleaned.match(/(\d+)/);
  if (!m) return cleaned.toLowerCase();
  return String(parseInt(m[1], 10));
}

function productNumber(productName: string): string {
  const m = String(productName || "").match(/#\s*([A-Za-z0-9]+)/);
  return m ? normalizeCardNumber(m[1]) : "";
}

async function lookupLocal(
  cardId: CardId,
  supabase: SupabaseClient,
): Promise<PriceChartingResult | null> {
  if (!cardId.card_name) return null;

  const name = cardId.card_name.trim();
  const number = normalizeCardNumber(cardId.card_number || "");
  const setTokens = setAliasTokens(cardId.card_set || "");
  const variant = (cardId.variant || "").toLowerCase().trim();
  const wantsFirstEdition = /1st\s*ed|first\s*edition/i.test(variant) ||
    /1st\s*ed|first\s*edition/i.test(cardId.card_set || "");

  // No hard category filter — category is only a soft ranking signal below.
  // This lets identifications like "Team Rocket (Rocket Gang)" match catalog
  // rows under `Pokemon Japanese Rocket Gang` even if upstream tagged the
  // category inconsistently.
  const { data, error } = await supabase
    .from("pricecharting_catalog")
    .select("*")
    .ilike("product_name", `%${name}%`)
    .limit(50);

  if (error || !data || data.length === 0) return null;

  type Row = Record<string, any>;
  const scored = (data as Row[])
    .map((r) => {
      const pname = String(r.product_name || "");
      const cname = String(r.console_name || "").toLowerCase();
      let score = 0;
      const reasons: string[] = [];

      // (1) Card-number match is the strongest signal.
      const pnum = productNumber(pname);
      if (number && pnum && pnum === number) { score += 50; reasons.push(`#${number}`); }
      else if (number && pnum && pnum !== number) { score -= 20; }
      else if (!number && !pnum) { score += 5; }

      // (2) Set-name token overlap against console_name (with aliases).
      let setHits = 0;
      for (const t of setTokens) if (cname.includes(t)) setHits++;
      if (setHits > 0) { score += Math.min(40, setHits * 15); reasons.push(`set:${setHits}`); }

      // (3) Soft category signal.
      if (cardId.category && r.category === cardId.category) { score += 8; }

      // (4) 1st Edition disambiguation.
      const isFirstEd = /1st\s*edition/i.test(pname);
      if (wantsFirstEdition && isFirstEd) score += 10;
      else if (!wantsFirstEdition && isFirstEd) score -= 8;

      // (5) Loose name token overlap.
      if (looseMatch(pname, name)) score += 5;

      return { row: r, score, reasons };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  console.log(
    `[pricecharting/local] best="${best.row.product_name}" (${best.row.console_name}) score=${best.score} reasons=${best.reasons.join(",")} of ${scored.length} candidates`,
  );

  if (!looseMatch(String(best.row.product_name || ""), name)) return null;
  return normalize(best.row as Record<string, unknown>, "local");
}


// ---------------------------------------------------------------------------
// Live API lookup (shared between pricecharting.com and sportscardspro.com)
// ---------------------------------------------------------------------------

async function fetchProduct(
  base: string,
  query: string,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  const url = `${base}/api/product?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      console.error("[pricecharting] HTTP", res.status, "for", base, query);
      return null;
    }
    const data = await res.json();
    if (data?.status !== "success") {
      console.warn("[pricecharting] non-success", base, query, data?.["error-message"]);
      return null;
    }
    return data as Record<string, unknown>;
  } catch (err) {
    console.error("[pricecharting] fetch error", (err as Error)?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupApi(
  cardId: CardId,
  apiKey: string,
  sports: boolean,
): Promise<PriceChartingResult | null> {
  const base = sports ? SCP_BASE : PC_BASE;
  const via = sports ? "sportscardspro" : "api";

  const specific = buildQuery(cardId, true);
  let product = specific ? await fetchProduct(base, specific, apiKey) : null;

  if (!product || !looseMatch(String(product["product-name"] ?? ""), cardId.card_name ?? "")) {
    const broad = buildQuery(cardId, false);
    if (broad && broad !== specific) {
      const retry = await fetchProduct(base, broad, apiKey);
      if (retry && looseMatch(String(retry["product-name"] ?? ""), cardId.card_name ?? "")) {
        product = retry;
      } else if (!product) {
        product = retry;
      }
    }
  }

  if (!product) return null;
  if (!looseMatch(String(product["product-name"] ?? ""), cardId.card_name ?? "")) return null;
  return normalize(product, via);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function getPriceChartingData(
  cardId: CardId,
  supabaseClient?: SupabaseClient,
): Promise<PriceChartingResult> {
  try {
    if (!cardId?.card_name) return emptyResult("missing_card_name");

    const apiKey = Deno.env.get("PRICECHARTING_API_KEY");
    const sports = isSports(cardId);

    // 1) Local catalog (skip for sports — not ingested)
    if (!sports) {
      const supabase = supabaseClient ?? getSupabase();
      if (supabase) {
        const local = await lookupLocal(cardId, supabase).catch((err) => {
          console.error("[pricecharting] local lookup error", (err as Error)?.message);
          return null;
        });
        if (local) return local;
      }
    }

    // 2) API fallback (always for sports)
    if (!apiKey) {
      console.error("[pricecharting] PRICECHARTING_API_KEY not configured");
      return emptyResult("missing_api_key");
    }
    const api = await lookupApi(cardId, apiKey, sports);
    if (api) return api;

    return emptyResult("no_match");
  } catch (err) {
    console.error("[pricecharting] unexpected error", (err as Error)?.message);
    return emptyResult("unexpected_error");
  }
}
