// Sealed product scanning: identify packaging, resolve the set, build a Top 5
// chase list. RULE: the chase list and all prices come ONLY from price data
// (pricecharting_catalog or the live PriceCharting/SportsCardsPro API).
// AI reads the packaging; it never picks cards or prices.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { geminiVisionJson } from "./gemini.ts";
import { scoreSetName, searchProducts, tokensOf } from "./pricecharting.ts";
import { IDENTIFY_MODEL } from "./analysisEngine.ts";

export type SealedIdent = {
  game: string; set_name: string | null; set_code: string | null; year: string | null; brand: string | null;
  product_kind: string; language: string; printed_name: string; confidence: "high" | "medium" | "low";
};

export type ChaseCard = {
  rank: number; name: string; rawPrice: number | null; psa9: number | null; psa10: number | null;
  salesVolume: number | null; thinMarket: boolean; catalogId: string | number; soldUrl: string;
};

export type ChaseResult = {
  chase: ChaseCard[];
  sealedProducts: { name: string; price: number | null }[];
  sealedPrice: number | null;
  sealedProductName: string | null;
  lastSyncedAt: string | null;
  source: "catalog" | "sportscardspro" | "pricecharting";
  partial: boolean;
};

const PROMPT = `This is a photo of a sealed trading card product. Read the packaging. Do not guess a set you can't read. Return JSON only:
{ "game": "pokemon"|"one-piece"|"magic"|"yugioh"|"lorcana"|"dragon-ball"|"digimon"|"baseball"|"basketball"|"football"|"hockey"|"soccer"|"other",
  "set_name": string|null, "set_code": string|null, "year": string|null, "brand": string|null,
  "product_kind": "booster pack"|"booster box"|"elite trainer box"|"booster bundle"|"collection box"|"tin"|"blister"|"hobby box"|"blaster box"|"mega box"|"case"|"other",
  "language": "english"|"japanese"|"other", "printed_name": string (the exact product name as printed), "confidence": "high"|"medium"|"low" }`;

const SEALED_WORDS = /\b(booster|box|pack|elite trainer|bundle|collection|tin|blister|display|case|starter|deck|build & battle|sleeved|code card)\b/i;
// Single cards carry a card number ("#94", "OP01-025"); sealed products never do.
const HAS_NUMBER = /#\s*[A-Za-z0-9]+|\b[A-Z]{2,4}\d{2}-\d{3}\b/;
export const SEALED_RE = { test: (name: string) => !HAS_NUMBER.test(name) && SEALED_WORDS.test(name) };

const CATEGORY: Record<string, string> = {
  pokemon: "pokemon-cards", "one-piece": "onepiece-cards", magic: "magic-cards", yugioh: "yugioh-cards",
  lorcana: "lorcana-cards", "dragon-ball": "dragon-ball-cards", digimon: "digimon-cards",
  baseball: "baseball-cards", basketball: "basketball-cards", football: "football-cards",
  hockey: "hockey-cards", soccer: "soccer-cards",
};
const SPORTS = new Set(["baseball", "basketball", "football", "hockey", "soccer"]);
const GAME_PREFIX: Record<string, string> = {
  pokemon: "Pokemon", "one-piece": "One Piece", magic: "Magic", yugioh: "YuGiOh", lorcana: "Lorcana",
  "dragon-ball": "Dragon Ball", digimon: "Digimon",
};

export const ebaySold = (q: string) =>
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`;
const c2d = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) / 100 : null;
};
const pick = (r: any, ...k: string[]) => { for (const x of k) if (r?.[x] != null && r[x] !== "") return r[x]; return null; };

export const gameCategory = (game: string) => CATEGORY[game] ?? null;
export const isSportsGame = (game: string) => SPORTS.has(game);

export async function identifySealed(imageUrl: string): Promise<SealedIdent | null> {
  const j = await geminiVisionJson(imageUrl, PROMPT, IDENTIFY_MODEL);
  if (!j) return null;
  const s = (v: unknown) => (v == null || v === "" ? null : String(v).trim());
  const conf = String(j.confidence || "").toLowerCase();
  return {
    game: String(j.game || "other").toLowerCase(),
    set_name: s(j.set_name), set_code: s(j.set_code), year: s(j.year), brand: s(j.brand),
    product_kind: String(j.product_kind || "other").toLowerCase(),
    language: String(j.language || "english").toLowerCase(),
    printed_name: s(j.printed_name) || "Sealed product",
    confidence: conf === "high" || conf === "low" ? conf : "medium",
  };
}

export type SetMatch =
  | { matched: true; consoleName: string; matchMethod: "barcode" | "name"; candidates: string[] }
  | { matched: false; reason: string; candidates: string[] };

const MIN_SCORE = 15;

/** Pick the best set from a list of names; ties return candidates instead of guessing. */
function bestOf(names: string[], ident: SealedIdent): SetMatch {
  if (!ident.set_name && !ident.set_code) return { matched: false, reason: "Set name not readable on packaging", candidates: [] };
  const jp = ident.language === "japanese";
  const scored = names.map((n) => ({ n, s: scoreSetName(n, ident.set_name || "", ident.set_code, jp) }))
    .sort((a, b) => b.s - a.s);
  const top = scored[0];
  if (!top || top.s < MIN_SCORE) {
    return { matched: false, reason: "No set matched the packaging", candidates: scored.slice(0, 3).filter((x) => x.s > 0).map((x) => x.n) };
  }
  const ties = scored.filter((x) => x.s === top.s).map((x) => x.n);
  if (ties.length > 1) return { matched: false, reason: "Several sets match equally", candidates: ties.slice(0, 5) };
  return { matched: true, consoleName: top.n, matchMethod: "name", candidates: scored.slice(1, 3).map((x) => x.n) };
}

export async function resolveSetCatalog(db: SupabaseClient, category: string, ident: SealedIdent, upc?: string | null): Promise<SetMatch> {
  if (upc) {
    const { data } = await db.from("pricecharting_catalog").select("console_name").eq("upc", upc).limit(1).maybeSingle();
    if (data?.console_name) return { matched: true, consoleName: data.console_name, matchMethod: "barcode", candidates: [] };
  }
  // Distinct set names for the category (paged to beat the 1000-row cap).
  const names = new Set<string>();
  for (let from = 0; from < 200000; from += 1000) {
    const { data } = await db.from("pricecharting_catalog").select("console_name")
      .eq("category", category).order("console_name").range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) if (r.console_name) names.add(r.console_name);
    if (data.length < 1000) break;
  }
  if (!names.size) return { matched: false, reason: `No ${category} sets in catalog`, candidates: [] };
  return bestOf([...names], ident);
}

let sealedLogCount = 0;

export function kindScore(name: string, kind: string): number {
  const n = name.toLowerCase();
  let s = 0;
  for (const t of tokensOf(kind)) if (n.includes(t)) s += 10;
  if (kind === "booster pack" && /\bpack\b/.test(n) && !/box|bundle/.test(n)) s += 10;
  if (kind === "booster box" && /booster box|display/.test(n)) s += 10;
  if (kind === "elite trainer box" && /elite trainer/.test(n)) s += 20;
  if (/\[/.test(n)) s -= 5; // prefer the standard product over bracketed variants ("[Blue Bottom]")
  return s;
}

function finish(singles: any[], sealed: any[], setName: string, kind: string, source: ChaseResult["source"], partial: boolean, lastSyncedAt: string | null): ChaseResult {
  const chase = singles
    .map((r) => ({ r, raw: c2d(pick(r, "loose_price", "loose-price")) }))
    .filter((x) => x.raw != null)
    .sort((a, b) => (b.raw! - a.raw!))
    .slice(0, 5)
    .map(({ r, raw }, i): ChaseCard => {
      const name = String(pick(r, "product_name", "product-name") || "");
      const vol = pick(r, "sales_volume", "sales-volume");
      const salesVolume = vol == null ? null : Number(vol);
      return {
        rank: i + 1, name, rawPrice: raw,
        psa9: c2d(pick(r, "graded_price", "graded-price")),
        psa10: c2d(pick(r, "manual_only_price", "manual-only-price")),
        salesVolume, thinMarket: salesVolume != null && salesVolume < 3,
        catalogId: pick(r, "id") ?? "", soldUrl: ebaySold(`${setName} ${name}`),
      };
    });
  const sealedProducts = sealed.map((r) => {
    const loose = pick(r, "loose_price", "loose-price"), nw = pick(r, "new_price", "new-price");
    const name = String(pick(r, "product_name", "product-name") || "");
    if (sealedLogCount < 20) { sealedLogCount++; console.log(`[sealed] price cols "${name}" loose=${loose} new=${nw}`); }
    return { name, price: c2d(loose ?? nw) };
  });
  const best = [...sealedProducts].filter((p) => p.price != null)
    .map((p) => ({ p, s: kindScore(p.name, kind) })).sort((a, b) => b.s - a.s)[0];
  const hit = best && best.s > 0 ? best.p : null;
  return { chase, sealedProducts, sealedPrice: hit?.price ?? null, sealedProductName: hit?.name ?? null, lastSyncedAt, source, partial };
}

export async function buildChaseFromCatalog(db: SupabaseClient, category: string, consoleName: string, kind: string): Promise<ChaseResult> {
  const rows: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await db.from("pricecharting_catalog")
      .select("id, product_name, loose_price, new_price, graded_price, manual_only_price, sales_volume, last_synced_at")
      .eq("category", category).eq("console_name", consoleName).range(from, from + 999);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const sealed = rows.filter((r) => SEALED_RE.test(r.product_name || ""));
  const singles = rows.filter((r) => !SEALED_RE.test(r.product_name || ""));
  const last = rows.reduce<string | null>((m, r) => (!m || r.last_synced_at > m ? r.last_synced_at : m), null);
  return finish(singles, sealed, consoleName, kind, "catalog", false, last);
}

/** Live API path: non-Pokémon TCGs (not in the local catalog) and sports. */
export async function resolveAndBuildLive(game: string, ident: SealedIdent): Promise<{ match: SetMatch; result: ChaseResult | null }> {
  const sports = isSportsGame(game);
  const prefix = sports ? "" : (GAME_PREFIX[game] ?? "");
  const q1 = [ident.year, ident.brand, prefix, ident.set_name].filter(Boolean).join(" ");
  const found = await searchProducts(sports, q1);
  const consoles = [...new Set(found.map((r) => String(r["console-name"] || "")).filter(Boolean))];
  if (!consoles.length) return { match: { matched: false, reason: "No sets found in live price search", candidates: [] }, result: null };
  const match = bestOf(consoles, ident);
  if (!match.matched) return { match, result: null };
  const inSet = (await searchProducts(sports, match.consoleName)).filter((r) => r["console-name"] === match.consoleName);
  const pool = [...found.filter((r) => r["console-name"] === match.consoleName), ...inSet];
  const uniq = [...new Map(pool.map((r) => [String(r.id), r])).values()];
  const sealed = uniq.filter((r) => SEALED_RE.test(String(r["product-name"] || "")));
  const singles = uniq.filter((r) => !SEALED_RE.test(String(r["product-name"] || "")));
  return { match, result: finish(singles, sealed, match.consoleName, ident.product_kind, sports ? "sportscardspro" : "pricecharting", true, new Date().toISOString()) };
}

const TTL_H = { catalog: 24, sportscardspro: 12, pricecharting: 12 } as const;

export async function readCache(db: SupabaseClient, key: string): Promise<ChaseResult | null> {
  const { data } = await db.from("sealed_chase_cache").select("payload, source, refreshed_at").eq("cache_key", key).maybeSingle();
  if (!data) return null;
  const ttl = TTL_H[(data.source as keyof typeof TTL_H)] ?? 12;
  if (Date.now() - new Date(data.refreshed_at).getTime() > ttl * 3600_000) return null;
  return data.payload as ChaseResult;
}

export async function writeCache(db: SupabaseClient, key: string, category: string, setName: string, r: ChaseResult) {
  await db.from("sealed_chase_cache").upsert({ cache_key: key, category, set_name: setName, payload: r, source: r.source, refreshed_at: new Date().toISOString() });
}

export const cacheKey = (category: string, setName: string) => `${category}|${setName}`.toLowerCase();

/** Pick the sealed product matching the scanned kind (cached lists are shared across kinds). */
export function pickSealed(products: { name: string; price: number | null }[], kind: string) {
  const best = products.filter((p) => p.price != null).map((p) => ({ p, s: kindScore(p.name, kind) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s > 0 ? best.p : null;
}
