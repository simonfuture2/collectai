// Admin-only Google Places (New) shop finder. Actions: estimate, search, search_state, import, details.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { adminUserId, enrichBatch, importPlaces, leadGenConfig, placeDetails, searchArea, STATE_CITIES, svc } from "../_shared/leadgen.ts";
import { placesCostEstimate } from "../_shared/leadScoring.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({
  action: z.enum(["estimate", "search", "search_state", "import", "details", "states"]),
  location: z.string().trim().min(2).max(120).optional(),
  state: z.string().trim().length(2).optional(),
  miles: z.number().min(5).max(30).optional(),
  terms: z.array(z.string().trim().min(2).max(60)).max(10).optional(),
  place_id: z.string().max(300).optional(),
  places: z.array(z.object({ place_id: z.string().max(300), name: z.string().max(300).optional().default(""), address: z.string().max(400).optional().default(""), website: z.string().max(500).nullable().optional(), city: z.string().max(120).nullable().optional(), state: z.string().max(10).nullable().optional(), miles: z.number().optional().default(0), matched: z.array(z.string()).optional().default([]) })).max(200).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = svc();
  const uid = await adminUserId(req, db);
  if (!uid) return json({ error: "Forbidden" }, 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
  const b = p.data;
  try {
    const cfg = await leadGenConfig(db);
    const terms = b.terms?.length ? b.terms : cfg.terms;
    if (b.action === "states") return json({ states: STATE_CITIES, terms: cfg.terms, cap: cfg.placesDailyCap });
    if (b.action === "estimate") {
      const cities = b.state ? (STATE_CITIES[b.state.toUpperCase()] ?? []).length : 1;
      const { data: used } = await db.from("daily_budget_counters").select("count").eq("bucket_key", "places_search").eq("day", new Date().toISOString().slice(0, 10)).maybeSingle();
      const e = placesCostEstimate(cities, terms.length);
      return json({ ...e, searches: e.searches + cities, cap: cfg.placesDailyCap, usedToday: used?.count ?? 0 });
    }
    if (b.action === "search") {
      if (!b.location) return json({ error: "Enter a city or ZIP" }, 400);
      const r = await searchArea(db, b.location, b.miles ?? 25, terms, cfg.placesDailyCap);
      return json(await markExisting(db, r));
    }
    if (b.action === "search_state") {
      const cities = STATE_CITIES[(b.state ?? "").toUpperCase()];
      if (!cities) return json({ error: "No city list for that state yet" }, 400);
      const all = new Map(); let searches = 0, capped = false;
      for (const c of cities) {
        const r = await searchArea(db, `${c}, ${b.state}`, b.miles ?? 15, terms, cfg.placesDailyCap);
        searches += r.searches; for (const h of r.hits) if (!all.has(h.place_id)) all.set(h.place_id, h);
        if (r.capped) { capped = true; break; }
      }
      return json(await markExisting(db, { hits: [...all.values()], searches, capped }));
    }
    if (b.action === "import") {
      const r = await importPlaces(db, (b.places ?? []) as never, uid);
      // Read their websites straight away (in the background so the screen doesn't wait).
      // deno-lint-ignore no-explicit-any
      if (r.imported.length) (globalThis as any).EdgeRuntime?.waitUntil(enrichBatch(db, r.imported));
      return json(r);
    }
    if (b.action === "details") {
      if (!b.place_id) return json({ error: "place_id required" }, 400);
      return json({ place: await placeDetails(b.place_id) });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[places-search]", e);
    return json({ error: (e as Error).message }, 502);
  }
});

// deno-lint-ignore no-explicit-any
async function markExisting(db: any, r: { hits: any[]; searches: number; capped: boolean }) {
  const ids = r.hits.map((h) => h.place_id);
  const { data } = ids.length ? await db.from("agent_leads").select("id, place_id").in("place_id", ids) : { data: [] };
  // deno-lint-ignore no-explicit-any
  const m = new Map((data ?? []).map((x: any) => [x.place_id, x.id]));
  return { ...r, hits: r.hits.map((h) => ({ ...h, lead_id: m.get(h.place_id) ?? null })) };
}
