// Price Check: fast photo → identification → PriceCharting candidates with full grade ladder.
// Never deducts credits and never writes to public.cards.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { geminiVisionJson } from "../_shared/gemini.ts";
import {
  normalizeLadder,
  scoreSetName,
  searchCatalogCandidates,
  searchProducts,
  tokensOf,
  type PriceLadder,
} from "../_shared/pricecharting.ts";

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
});

type Reading = {
  name: string; number?: string | null; set?: string | null; year?: string | null;
  language?: string | null; variant?: string | null; game?: string | null;
};

type Candidate = {
  productId: number; name: string; set: string | null; number: string | null;
  ladder: PriceLadder; url: string; score: number; from: "catalog" | "api";
};

const PROMPT = `Identify the trading card in this photo. Return JSON only:
{"best":{"name":"","number":"","set":"","year":"","language":"","variant":"","game":""},"alternates":[...up to 2 objects with the same keys]}
- name: card/player name only. number: collector number as printed (e.g. "4/102", "OP01-120"). variant: parallel/foil/holo/reverse/alt art etc, or "".
- game: one of pokemon, magic, yugioh, one piece, lorcana, dragon ball, baseball, basketball, football, hockey, soccer.
- language: english, japanese, etc. Use "" for unknowns. Alternates only if genuinely plausible.`;

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

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { imagePath, category: catInput, packRipId } = parsed.data;
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
  if (allowed.error || allowed.data !== true) return json({ error: "Price Check isn't available on your account yet" }, 403);
  if ((hourCount.count ?? 0) >= HOURLY_LIMIT) return json({ error: "Hourly Price Check limit reached (60). Try again later." }, 429);
  if ((dayCount.count ?? 0) >= DAILY_LIMIT) return json({ error: "Daily Price Check limit reached (400). Try again tomorrow." }, 429);
  if (!signed.data?.signedUrl) return json({ error: "Image not found" }, 404);
  mark("auth_ms", t);

  // 2. Identification (Gemini Flash only)
  t = performance.now();
  const ai = await geminiVisionJson(signed.data.signedUrl, PROMPT, "gemini-3.5-flash", 400);
  mark("identify_ms", t);
  if (ai === null) {
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
        { card_name: r.name, card_number: r.number ?? undefined, card_set: r.set ?? undefined, category, japanese: (r.language ?? "").toLowerCase().startsWith("jap") },
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
  if (goodCount() < 3 || !inCatalog) {
    t = performance.now();
    const q = [best.name, best.set, best.number ? `#${normNum(best.number)}` : ""].filter(Boolean).join(" ");
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
  const candidates = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  const selected = candidates[0] ?? null;
  mark("rank_ms", t);

  // 5. Save
  t = performance.now();
  const latencyMs = Math.round(performance.now() - t0);
  const identification = { best, alternates: readings.slice(1), category: category ?? null, timings };
  const { data: row, error: insErr } = await admin.from("price_checks").insert({
    user_id: userId,
    image_path: imagePath,
    identification,
    candidates,
    selected_product_id: selected?.productId ?? null,
    selected_prices: selected?.ladder ?? null,
    source: source === "catalog" ? "catalog" : "api",
    latency_ms: latencyMs,
    pack_rip_id: packRipId ?? null,
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
  });
});
