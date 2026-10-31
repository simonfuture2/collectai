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

export const PC_BASE = "https://www.pricecharting.com";
export const SCP_BASE = "https://www.sportscardspro.com";
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

export function tokensOf(s: string): Set<string> {
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

export function setAliasTokens(rawSet: string): string[] {
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
  const cacheKey = `${base}|product|${query}`;
  const cached = await readLiveCache(cacheKey);
  if (cached) return cached as Record<string, unknown>;
  const url = `${base}/api/product?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  try {
    const res = await pcThrottledFetch(url);
    if (!res.ok) {
      console.error("[pricecharting] HTTP", res.status, "for", base, query);
      return null;
    }
    const data = await res.json();
    if (data?.status !== "success") {
      console.warn("[pricecharting] non-success", base, query, data?.["error-message"]);
      return null;
    }
    const pid = Number(data?.id);
    if (Number.isFinite(pid)) await writeLiveCache(pid, cacheKey, data);
    return data as Record<string, unknown>;
  } catch (err) {
    console.error("[pricecharting] fetch error", (err as Error)?.message);
    return null;
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


/** Live multi-result search (/api/products). Returns raw API rows, or [] on failure. */
export async function searchProducts(sports: boolean, query: string): Promise<Record<string, any>[]> {
  const apiKey = Deno.env.get("PRICECHARTING_API_KEY");
  if (!apiKey || !query.trim()) return [];
  const base = sports ? SCP_BASE : PC_BASE;
  const cacheKey = `${base}|products|${query}`;
  const cached = await readLiveCache(cacheKey);
  if (cached && Array.isArray((cached as any).products)) return (cached as any).products;
  const url = `${base}/api/products?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  try {
    const res = await pcThrottledFetch(url);
    if (!res.ok) { console.error("[pricecharting] products HTTP", res.status, query); return []; }
    const data = await res.json();
    const products = Array.isArray(data?.products) ? data.products : [];
    const pid = Number(products[0]?.id);
    if (products.length && Number.isFinite(pid)) await writeLiveCache(pid, cacheKey, { products });
    return products;
  } catch (err) {
    console.error("[pricecharting] products error", (err as Error)?.message);
    return [];
  }
}

/** Score a catalog/API set name against identified set words (with aliases). */
export function scoreSetName(consoleName: string, setName: string, setCode: string | null, japanese: boolean): number {
  const c = (consoleName || "").toLowerCase();
  const cTok = tokensOf(c);
  let score = 0;
  for (const t of setAliasTokens(setName)) {
    if (t.includes(" ") ? c.includes(t) : cTok.has(t)) score += t.includes(" ") ? 20 : 10;
  }
  if (setCode && c.includes(setCode.toLowerCase())) score += 15;
  const isJp = c.includes("japanese");
  if (japanese && isJp) score += 10;
  if (!japanese && isJp) score -= 15;
  // Penalise long console names with many unmatched words.
  const want = tokensOf(setName);
  for (const t of cTok) if (!want.has(t) && !["pokemon", "cards", "japanese", "magic", "yugioh", "one", "piece"].includes(t)) score -= 2;
  return score;
}


// ---------------------------------------------------------------------------
// App-wide call spacing + 24h live cache
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for a global slot (pc_acquire_slot) and then fetches. Never faster than 1/s app-wide. */
export async function pcThrottledFetch(url: string): Promise<Response> {
  let wait = MIN_GAP_MS;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.rpc("pc_acquire_slot");
    if (!error && typeof data === "number" && Number.isFinite(data)) wait = Math.max(0, data);
    else console.warn("[pricecharting] pc_acquire_slot failed, waiting fallback", error?.message);
  }
  if (wait > 0) await sleep(wait);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readLiveCache(key: string): Promise<unknown | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb
      .from("pricecharting_live_cache")
      .select("payload, fetched_at")
      .ilike("query", key.replace(/[\\%_]/g, (c) => "\\" + c))
      .maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.fetched_at as string).getTime() > CACHE_TTL_MS) return null;
    console.log("[pricecharting] cache hit", key);
    return data.payload;
  } catch {
    return null;
  }
}

async function writeLiveCache(productId: number, key: string, payload: unknown): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    // Clear any older row holding this query text (unique on lower(query)) or this product.
    await sb.from("pricecharting_live_cache").delete().ilike("query", key.replace(/[\\%_]/g, (c) => "\\" + c));
    const { error } = await sb.from("pricecharting_live_cache").upsert(
      { product_id: productId, query: key, payload, fetched_at: new Date().toISOString() },
      { onConflict: "product_id" },
    );
    if (error) console.warn("[pricecharting] cache write", error.message);
  } catch { /* never break a lookup */ }
}

// ---------------------------------------------------------------------------
// Full grade ladder
// ---------------------------------------------------------------------------

export const LADDER_KEYS = {
  ungraded: "loose-price",
  grade1: "condition-9-price",
  grade2: "condition-10-price",
  grade3: "condition-13-price",
  grade4: "condition-14-price",
  grade5: "condition-15-price",
  grade6: "condition-16-price",
  grade7: "cib-price",
  grade8: "new-price",
  grade9: "graded-price",
  grade9_5: "box-only-price",
  psa10: "manual-only-price",
  bgs10: "bgs-10-price",
  cgc10: "condition-17-price",
  sgc10: "condition-18-price",
  cgc10_pristine: "condition-19-price",
  bgs10_black: "condition-20-price",
  tag10: "condition-21-price",
  ace10: "condition-22-price",
} as const;

export type PriceLadder = Partial<Record<keyof typeof LADDER_KEYS, number>>;

/** Every grade price in dollars from an API row (hyphen keys) or catalog row (underscore keys). Missing values omitted. */
export function normalizeLadder(row: Record<string, unknown> | null | undefined): PriceLadder {
  const out: PriceLadder = {};
  if (!row) return out;
  for (const [grade, key] of Object.entries(LADDER_KEYS)) {
    let raw = row[key] ?? row[key.replace(/-/g, "_")];
    if (raw === undefined && key === "bgs-10-price") raw = row["bgs_10_price"];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[grade as keyof PriceLadder] = Math.round(n) / 100;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Catalog-only candidate search (no API call)
// ---------------------------------------------------------------------------

export type CatalogCandidate = {
  product_id: number;
  product_name: string;
  console_name: string | null;
  category: string;
  score: number;
  ladder: PriceLadder;
};

function normNum(n: string | null | undefined): string {
  return String(n ?? "").split("/")[0].replace(/^#/, "").replace(/^0+(?=\w)/, "").trim().toLowerCase();
}

export async function searchCatalogCandidates(
  identification: CardId & { japanese?: boolean; set_code?: string | null },
  limit = 8,
  supabaseClient?: SupabaseClient,
): Promise<CatalogCandidate[]> {
  const name = (identification?.card_name ?? "").trim();
  if (!name) return [];
  const sb = supabaseClient ?? getSupabase();
  if (!sb) return [];
  const esc = (v: string) => v.replace(/[\\%_]/g, (c) => "\\" + c);
  const num = normNum(identification.card_number);
  const nameTokens = [...tokensOf(name)];
  const pattern = "%" + (nameTokens.length ? nameTokens.map(esc).join("%") : esc(name)) + "%";

  const queries = [sb.from("pricecharting_catalog").select("*").ilike("product_name", pattern).limit(60)];
  if (num) {
    const first = nameTokens[0] ?? esc(name);
    queries.push(sb.from("pricecharting_catalog").select("*").ilike("product_name", `%${first}%#${esc(num)}%`).limit(30));
  }
  const results = await Promise.all(queries);
  const rows = new Map<number, Record<string, any>>();
  for (const r of results) for (const row of r.data ?? []) rows.set(Number(row.id), row);

  const set = identification.card_set ?? "";
  const scored: CatalogCandidate[] = [];
  for (const row of rows.values()) {
    const pTok = tokensOf(row.product_name);
    let score = 0;
    for (const t of nameTokens) score += pTok.has(t) ? 10 : -5;
    const m = String(row.product_name).match(/#\s*([\w-]+)/);
    if (num) {
      if (m && normNum(m[1]) === num) score += 30;
      else if (m) score -= 20;
    }
    if (set) score += scoreSetName(row.console_name ?? "", set, identification.set_code ?? null, !!identification.japanese);
    if (identification.category && row.category === identification.category) score += 8;
    scored.push({
      product_id: Number(row.id),
      product_name: row.product_name,
      console_name: row.console_name ?? null,
      category: row.category,
      score,
      ladder: normalizeLadder(row),
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
