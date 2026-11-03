// Price Check: fast photo → identification → PriceCharting candidates with full grade ladder.
// Never deducts credits and never writes to public.cards.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { geminiVisionJson, lastGeminiFailure } from "../_shared/gemini.ts";
import {
  normalizeLadder,
  scoreSetName,
  searchCatalogCandidates,
  searchProducts,
  tokensOf,
  type PriceLadder,
} from "../_shared/pricecharting.ts";
import { groupParallels, languageBoost, normLanguage, parallelLabel, slabRung, type Slab } from "./ranking.ts";

const HOURLY_LIMIT = 60;
const DAILY_LIMIT = 400;
const MAX_CANDIDATES = 8;
// Categories held in the stored list. Lorcana / Dragon Ball count only once synced (checked at runtime).
const CATALOG_CATEGORIES = new Set(["pokemon-cards", "magic-cards", "yugioh-cards", "onepiece-cards"]);
const NEW_CATALOG_CATEGORIES = new Set(["lorcana-cards", "dragon-ball-cards"]);
const GAME_TO_CATEGORY: Record<string, string> = {
  pokemon: "pokemon-cards", magic: "magic-cards", mtg: "magic-cards", yugioh: "yugioh-cards",
  "yu-gi-oh": "yugioh-cards", "one piece": "onepiece-cards", onepiece: "onepiece-cards",
  lorcana: "lorcana-cards", "dragon ball": "dragon-ball-cards", dragonball: "dragon-ball-cards",
  baseball: "baseball-cards", basketball: "basketball-cards", football: "football-cards",
  hockey: "hockey-cards", soccer: "soccer-cards",
};
const SPORTS = new Set(["baseball-cards", "basketball-cards", "football-cards", "hockey-cards", "soccer-cards"]);

const Body = z.object({
  imagePath: z.string().min(3).max(500),
  category: z.string().max(60).optional(),
  packRipId: z.string().uuid().optional(),
  lab: z.boolean().optional(),
});

type Reading = {
  name: string; number?: string | null; set?: string | null; year?: string | null;
  language?: string | null; variant?: string | null; game?: string | null;
  slab?: Slab;
};

type Candidate = {
  productId: number; name: string; set: string | null; number: string | null;
  ladder: PriceLadder; url: string; score: number; from: "catalog" | "api";
  parallel?: string | null; rank?: number; japanese?: boolean;
};

const PROMPT = `Identify the trading card in this photo. Return JSON only:
{"best":{"name":"","number":"","set":"","year":"","language":"","variant":"","game":"","slab":null},"alternates":[...up to 2 objects with the same keys]}
- name: card/player name only. number: collector number as printed (e.g. "4/102", "OP01-120"). variant: parallel/foil/holo/reverse/alt art etc, or "".
- game: one of pokemon, magic, yugioh, one piece, lorcana, dragon ball, baseball, basketball, football, hockey, soccer.
- language: english, japanese, korean or other, based on the text printed on the card.
- slab: if the card is in a graded slab, {"company":"PSA|BGS|CGC|SGC|TAG|ACE","grade":"10","label":"e.g. Black Label/Pristine or \"\""} from the cert label; otherwise null.
Use "" for unknowns. Alternates only if genuinely plausible.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normNum = (n?: string | null) =>
  String(n ?? "").split("/")[0].replace(/^#/, "").replace(/^0+(?=\w)/, "").trim().toLowerCase();

function numberOf(productName: string): string | null {
  const m = productName.match(/#\s*([\w-]+)/);
  return m ? m[1] : null;
}

function rank(c: { name: string; set: string | null; number: string | null }, r: Reading): number {
  let s = 0;
  const want = [...tokensOf(r.name)];
  const have = tokensOf(c.name);
  for (const t of want) s += have.has(t) ? 10 : -5;
  const n = normNum(r.number);
  if (n) {
    if (c.number && normNum(c.number) === n) s += 40;
    else if (c.number) s -= 20;
  }
  if (r.set) s += scoreSetName(c.set ?? "", r.set, null, (r.language ?? "").toLowerCase().startsWith("jap"));
  const v = (r.variant ?? "").toLowerCase().trim();
  const lname = c.name.toLowerCase();
  if (v) {
    for (const t of tokensOf(v)) if (lname.includes(t)) s += 8;
  } else if (/\[(.+?)\]/.test(c.name)) {
    s -= 6; // product is a parallel but none was read
  }
  s += languageBoost(normLanguage(r.language), c.name, c.set);
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const mark = (step: string, since: number) => {
    timings[step] = Math.round(performance.now() - since);
    console.log(`[price-check] ${step} ${timings[step]}ms`);
  };

  // 1. Auth
  let t = performance.now();
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.slice(7));
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const raw = await req.json().catch(() => null);
  if (raw?.action) return handleAction(raw, userId);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { imagePath, category: catInput, packRipId, lab: labReq } = parsed.data;
  if (!imagePath.startsWith(`${userId}/`) || imagePath.includes("..")) {
    return json({ error: "Image must be in your own folder" }, 403);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [allowed, hourCount, dayCount, signed] = await Promise.all([
    admin.rpc("can_use_price_check", { _uid: userId }),
    admin.from("price_checks").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", hourAgo),
    admin.from("price_checks").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", dayAgo),
    admin.storage.from("card-images").createSignedUrl(imagePath, 600),
  ]);
  // Admin test lab: skip per-user limits and don't record the run as a real check.
  const lab = labReq === true && (await admin.rpc("is_admin", { _user_id: userId })).data === true;
  if (labReq && !lab) return json({ error: "Lab runs are admin-only" }, 403);
  if (allowed.error || allowed.data !== true) return json({ error: "Price Check isn't available on your account yet" }, 403);
  if (!lab && (hourCount.count ?? 0) >= HOURLY_LIMIT) return json({ error: "Hourly Price Check limit reached (60). Try again later." }, 429);
  if (!lab && (dayCount.count ?? 0) >= DAILY_LIMIT) return json({ error: "Daily Price Check limit reached (400). Try again tomorrow." }, 429);
  if (!signed.data?.signedUrl) return json({ error: "Image not found" }, 404);
  mark("auth_ms", t);

  // 2. Identification (Gemini Flash only)
  t = performance.now();
  const ai = await geminiVisionJson(signed.data.signedUrl, PROMPT, "gemini-3.5-flash", 2048);
  mark("identify_ms", t);
  if (ai === null) {
    if (lastGeminiFailure === "rate_limited") return json({ error: "AI busy, try again in a moment." }, 429);
    if (lastGeminiFailure === "credits_exhausted") return json({ error: "AI credits used up. Please try again later." }, 402);
    return json({ error: "Price Check is temporarily unavailable. Please try again shortly." }, 503);
  }
  const readings: Reading[] = [ai?.best, ...(Array.isArray(ai?.alternates) ? ai.alternates.slice(0, 2) : [])]
    .filter((r): r is Reading => !!r && typeof r.name === "string" && r.name.trim().length > 0)
    .map((r) => ({ ...r, name: r.name.trim() }));
  if (!readings.length) {
    return json({ error: "Couldn't read the card. Try a closer, well-lit photo." }, 422);
  }
  const best = readings[0];
  const category =
    catInput ?? GAME_TO_CATEGORY[(best.game ?? "").toLowerCase().trim()] ?? undefined;

  // 3. Candidates — stored list first
  t = performance.now();
  const byId = new Map<number, Candidate>();
  let inCatalog = !!category && CATALOG_CATEGORIES.has(category);
  if (category && NEW_CATALOG_CATEGORIES.has(category)) {
    const { count } = await admin.from("pricecharting_catalog").select("id", { count: "exact", head: true }).eq("category", category).limit(1);
    inCatalog = (count ?? 0) > 0;
  }
  if (!category || inCatalog) {
    const lists = await Promise.all(readings.map((r) =>
      searchCatalogCandidates(
        { card_name: r.name, card_number: r.number ?? undefined, card_set: r.set ?? undefined, category, japanese: ["japanese", "korean"].includes(normLanguage(r.language) ?? "") },
        MAX_CANDIDATES,
        admin,
      ).catch(() => [])
    ));
    for (const list of lists) for (const c of list) {
      if (byId.has(c.product_id)) continue;
      byId.set(c.product_id, {
        productId: c.product_id, name: c.product_name, set: c.console_name, number: numberOf(c.product_name),
        ladder: c.ladder, url: `https://www.pricecharting.com/game/${c.product_id}`, score: 0, from: "catalog",
      });
    }
  }
  mark("catalog_ms", t);

  const scoreAll = () => {
    for (const c of byId.values()) c.score = Math.max(...readings.map((r, i) => rank(c, r) - i * 3));
  };
  scoreAll();
  const goodCount = () => [...byId.values()].filter((c) => c.score >= 20).length;

  // ONE live call when the stored list isn't enough
  let source: "catalog" | "api" | "catalog+api" = "catalog";
  let liveCalls = 0;
  if (goodCount() < 3 || !inCatalog) {
    t = performance.now();
    const q = [best.name, best.set, best.number ? `#${normNum(best.number)}` : ""].filter(Boolean).join(" ");
    liveCalls = 1;
    const live = await searchProducts(!!category && SPORTS.has(category), q).catch(() => []);
    for (const p of live) {
      const id = Number(p?.id);
      if (!Number.isFinite(id) || byId.has(id)) continue;
      const name = String(p["product-name"] ?? "");
      byId.set(id, {
        productId: id, name, set: p["console-name"] ?? null, number: numberOf(name),
        ladder: normalizeLadder(p), url: `https://www.pricecharting.com/game/${id}`, score: 0, from: "api",
      });
    }
    source = byId.size && [...byId.values()].some((c) => c.from === "catalog") ? "catalog+api" : "api";
    if (!live.length && [...byId.values()].some((c) => c.from === "catalog")) source = "catalog";
    scoreAll();
    mark("live_ms", t);
  }

  // 4. Rank
  t = performance.now();
  const top = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  const candidates = groupParallels(top).map((c, i) => ({
    ...c, rank: i + 1, parallel: parallelLabel(c.name), japanese: /japanese/i.test(`${c.name} ${c.set ?? ""}`),
  }));
  const language = normLanguage(best.language);
  const slab = best.slab && typeof best.slab === "object" ? best.slab : null;
  const rung = slabRung(slab);
  const selected = candidates[0] ?? null;
  mark("rank_ms", t);

  // 5. Save
  t = performance.now();
  const latencyMs = Math.round(performance.now() - t0);
  const identification = { best, alternates: readings.slice(1), category: category ?? null, language, slab, rung, timings };
  const { data: row, error: insErr } = lab ? { data: null, error: null } : await admin.from("price_checks").insert({
    user_id: userId,
    image_path: imagePath,
    identification,
    candidates,
    selected_product_id: selected?.productId ?? null,
    selected_prices: selected?.ladder ?? null,
    source: source === "catalog" ? "catalog" : "api",
    latency_ms: latencyMs,
    pack_rip_id: packRipId ?? null,
    game: (best.game ?? "").toLowerCase().trim() || null,
  }).select("id").single();
  mark("save_ms", t);
  if (insErr) console.error("[price-check] insert error", insErr.message);
  console.log(`[price-check] total ${latencyMs}ms source=${source} candidates=${candidates.length}`);

  return json({
    priceCheckId: row?.id ?? null,
    selected,
    candidates,
    identification,
    source,
    latencyMs,
    liveCalls,
  });
});

// ---- Follow-up actions from the result page (no credits, no live API calls) ----
const ActionBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select"), priceCheckId: z.string().uuid(), productId: z.number().int().positive() }),
  z.object({ action: z.literal("search"), query: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("link"), priceCheckId: z.string().uuid(), cardId: z.string().uuid() }),
]);

async function handleAction(raw: unknown, userId: string): Promise<Response> {
  const parsed = ActionBody.safeParse(raw);
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const body = parsed.data;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const allowed = await admin.rpc("can_use_price_check", { _uid: userId });
  if (!allowed.data) return json({ error: "Price Check is not available on your account yet" }, 403);

  if (body.action === "search") {
    const m = body.query.match(/#?\s*(\d+[a-z]?(?:\/\d+)?)\s*$/i);
    const name = m ? body.query.slice(0, m.index).trim() || body.query : body.query;
    // deno-lint-ignore no-explicit-any
    const found = await searchCatalogCandidates({ card_name: name, card_number: m?.[1] ?? null } as any, MAX_CANDIDATES, admin);
    return json({ candidates: found.map(c => ({
      productId: c.product_id, name: c.product_name, set: c.console_name, number: numberOf(c.product_name),
      ladder: c.ladder, url: `https://www.pricecharting.com/game/${c.product_id}`,
    })) });
  }

  const { data: row } = await admin.from("price_checks").select("id, candidates").eq("id", body.priceCheckId).eq("user_id", userId).maybeSingle();
  if (!row) return json({ error: "Price check not found" }, 404);

  if (body.action === "link") {
    const { data: card } = await admin.from("cards").select("id").eq("id", body.cardId).eq("user_id", userId).maybeSingle();
    if (!card) return json({ error: "Card not found" }, 404);
    await admin.from("price_checks").update({ added_card_id: body.cardId }).eq("id", row.id);
    return json({ ok: true });
  }

  // deno-lint-ignore no-explicit-any
  const list = (row.candidates as any[]) ?? [];
  let candidates = list;
  if (!list.some(c => Number(c.productId) === body.productId)) {
    // A search pick: re-read it from the stored list so prices are never client-supplied.
    const { data: cat } = await admin.from("pricecharting_catalog").select("*").eq("id", body.productId).maybeSingle();
    if (!cat) return json({ error: "Product not in the stored list" }, 400);
    candidates = [...list, {
      productId: body.productId, name: cat.product_name, set: cat.console_name, number: numberOf(cat.product_name),
      ladder: normalizeLadder(cat), url: `https://www.pricecharting.com/game/${body.productId}`,
    }];
  }
  const selected = candidates.find(c => Number(c.productId) === body.productId);
  const pos = list.findIndex(c => Number(c.productId) === body.productId);
  const picked_rank = pos >= 0 ? pos + 1 : 0; // 0 = picked from search, not in the list
  const { error } = await admin.from("price_checks").update({ picked_rank, selected_product_id: body.productId, selected_prices: selected?.ladder ?? null, candidates }).eq("id", row.id);
  if (error) return json({ error: "Could not save the choice" }, 500);
  return json({ ok: true, selected, candidates });
}
