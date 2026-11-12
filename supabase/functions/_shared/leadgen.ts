// Lead finding helpers shared by places-search, enrich-lead, lead-import and lead-run.
// Google Places: only place_id is stored long-term (Maps Platform terms); business details load live.
// Enrichment: facts come from the business's own website, each saved with the page it came from.
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailsInText, fitScore, radiusMeters, shouldRetryEnrich, ENRICH_BATCH_MAX, PLACES_DAILY_CAP_DEFAULT } from "./leadScoring.ts";

// deno-lint-ignore no-explicit-any
export type Any = any;
export const DEFAULT_TERMS = ["trading card shop", "Pokémon card store", "sports card shop", "game store", "comic and card shop", "collectibles store"];

export const STATE_CITIES: Record<string, string[]> = {
  MD: ["Baltimore", "Bel Air", "Columbia", "Frederick", "Annapolis", "Rockville", "Silver Spring", "Hagerstown", "Salisbury", "Waldorf", "Glen Burnie", "Towson"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Harrisburg", "Lancaster", "York", "Erie", "Scranton", "Reading", "State College"],
  VA: ["Virginia Beach", "Richmond", "Norfolk", "Arlington", "Alexandria", "Roanoke", "Fredericksburg", "Charlottesville", "Lynchburg"],
  DE: ["Wilmington", "Dover", "Newark", "Rehoboth Beach"],
  NJ: ["Newark", "Jersey City", "Paterson", "Trenton", "Cherry Hill", "Toms River", "Edison", "Atlantic City"],
  NY: ["New York", "Buffalo", "Rochester", "Syracuse", "Albany", "Yonkers", "Long Island", "White Plains"],
  DC: ["Washington"],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Wilmington", "Asheville", "Fayetteville"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton"],
  FL: ["Miami", "Orlando", "Tampa", "Jacksonville", "Tallahassee", "Fort Lauderdale", "St. Petersburg", "Fort Myers"],
  TX: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso", "Plano", "Lubbock"],
  CA: ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Sacramento", "Fresno", "Irvine", "Oakland", "Riverside"],
};

export const svc = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export async function adminUserId(req: Request, db: Any): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth.slice(7));
  const uid = data?.user?.id;
  if (!uid) return null;
  const [{ data: a }, { data: g }] = await Promise.all([db.rpc("is_admin", { _user_id: uid }), db.from("agent_admins").select("user_id").eq("user_id", uid).maybeSingle()]);
  return a === true || g ? uid : null;
}

export async function leadGenConfig(db: Any) {
  const { data } = await db.from("agent_settings").select("config").eq("key", "lead_gen").maybeSingle();
  const c = data?.config ?? {};
  return {
    placesDailyCap: Number(c.places_daily_cap ?? PLACES_DAILY_CAP_DEFAULT),
    terms: Array.isArray(c.terms) && c.terms.length ? c.terms.map(String) : DEFAULT_TERMS,
    raw: c,
  };
}

const GATEWAY_PLACES = "https://connector-gateway.lovable.dev/google_maps/places/v1";
const DIRECT_PLACES = "https://places.googleapis.com/v1";
/** Managed Google Maps connection first; own GOOGLE_PLACES_API_KEY only when it isn't linked. */
function placesRoute(): { base: string; headers: Record<string, string> } {
  const lovable = Deno.env.get("LOVABLE_API_KEY"), conn = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (lovable && conn) return { base: GATEWAY_PLACES, headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": conn } };
  const k = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (k) return { base: DIRECT_PLACES, headers: { "X-Goog-Api-Key": k } };
  throw new Error("Google Maps isn't connected for shop search");
}
async function placesPost(path: string, body: unknown, mask: string) {
  const { base, headers } = placesRoute();
  const r = await fetch(`${base}/${path}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", "X-Goog-FieldMask": mask }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Google Places ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

/** Use one cheap search to find the centre point of a city or ZIP. */
export async function geocode(location: string): Promise<{ lat: number; lng: number } | null> {
  const j = await placesPost("places:searchText", { textQuery: location, pageSize: 1 }, "places.location");
  const l = j.places?.[0]?.location;
  return l ? { lat: l.latitude, lng: l.longitude } : null;
}

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface PlaceHit { place_id: string; name: string; address: string; website: string | null; city: string | null; state: string | null; miles: number; matched: string[] }

function cityState(components: Any[] = []) {
  const get = (t: string, short = false) => components.find((c: Any) => (c.types ?? []).includes(t))?.[short ? "shortText" : "longText"] ?? null;
  return { city: get("locality") ?? get("sublocality") ?? get("postal_town"), state: get("administrative_area_level_1", true) };
}

/** Searches every term around one place and merges by place_id. Consumes the daily search budget per request. */
export async function searchArea(db: Any, location: string, miles: number, terms: string[], cap: number): Promise<{ hits: PlaceHit[]; searches: number; capped: boolean }> {
  const center = await geocode(location);
  if (!center) throw new Error(`Couldn't find "${location}"`);
  const radius = radiusMeters(miles);
  const byId = new Map<string, PlaceHit>();
  let searches = 1, capped = false;
  for (const term of terms) {
    const { data: b } = await db.rpc("consume_daily_budget", { _bucket_key: "places_search", _max_per_day: cap });
    if (!(Array.isArray(b) ? b[0] : b)?.allowed) { capped = true; break; }
    searches++;
    const j = await placesPost("places:searchText", {
      textQuery: term, pageSize: 20,
      locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
    }, "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.addressComponents");
    for (const p of j.places ?? []) {
      const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
      const d = loc ? distMeters(center, loc) : Infinity;
      if (d > radius) continue;
      const prev = byId.get(p.id);
      if (prev) { prev.matched.push(term); continue; }
      const cs = cityState(p.addressComponents);
      byId.set(p.id, { place_id: p.id, name: p.displayName?.text ?? "", address: p.formattedAddress ?? "", website: p.websiteUri ?? null, city: cs.city, state: cs.state, miles: Math.round((d / 1609.34) * 10) / 10, matched: [term] });
    }
  }
  return { hits: [...byId.values()].sort((a, b) => a.miles - b.miles), searches, capped };
}

export async function placeDetails(placeId: string) {
  const r = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": placesKey(), "X-Goog-FieldMask": "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours.weekdayDescriptions,googleMapsUri,businessStatus" } });
  const t = await r.text();
  if (!r.ok) throw new Error(`Google Places ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

/** Saves only place_id, type, source, city/state and website (allowed to store). Skips ones already on the list. */
export async function importPlaces(db: Any, rows: PlaceHit[], ownerId: string | null) {
  const ids = rows.map((r) => r.place_id).filter(Boolean);
  const { data: existing } = await db.from("agent_leads").select("place_id").in("place_id", ids.length ? ids : ["-"]);
  const have = new Set((existing ?? []).map((r: Any) => r.place_id));
  const fresh = rows.filter((r) => !have.has(r.place_id));
  if (!fresh.length) return { imported: [] as string[], skipped: rows.length };
  const { data, error } = await db.from("agent_leads").insert(fresh.map((r) => ({
    platform: "places", lead_type: "card_shop", source: "places", place_id: r.place_id,
    business_name: r.name || null, name: r.name || null, // shown in admin; refreshed from Google live in the person view
    city: r.city, state: r.state, country: "US", website: r.website, owner_id: ownerId,
    enrich_status: r.website ? "pending" : "none", tags: ["places"],
  }))).select("id");
  if (error) throw new Error(error.message);
  return { imported: (data ?? []).map((r: Any) => r.id as string), skipped: rows.length - fresh.length };
}

// ───────── Website enrichment (Firecrawl, direct-API connection) ─────────
const FC = "https://api.firecrawl.dev/v2";
const FACTS_SCHEMA = {
  type: "object",
  properties: {
    business_name: { type: "string" },
    phone: { type: "string" },
    social_links: { type: "array", items: { type: "string" } },
    sells: { type: "array", items: { type: "string", enum: ["singles", "sealed", "sports", "tcg", "comics", "other_collectibles"] } },
    buys_cards: { type: "boolean" },
    runs_events: { type: "boolean" },
    sells_online: { type: "boolean" },
  },
};
class RateLimited extends Error { constructor() { super("Firecrawl rate limit"); } }
async function scrape(url: string, tries = 0): Promise<Any> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY is not configured");
  const r = await fetch(`${FC}/scrape`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown", "links", { type: "json", schema: FACTS_SCHEMA, prompt: "Only facts stated on this page. Leave a field out if the page doesn't say it." }], onlyMainContent: false, timeout: 30000 }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 && tries < 3) { await new Promise((ok) => setTimeout(ok, 10_000 * (tries + 1))); return scrape(url, tries + 1); }
  if (r.status === 429) throw new RateLimited();
  if (!r.ok) throw new Error(`Firecrawl ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data ?? {};
}
const normUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
const SOCIAL = /(instagram|facebook|tiktok|youtube|twitter|x\.com|discord|whatnot|ebay|tcgplayer)\./i;

export async function enrichOne(db: Any, lead: Any) {
  const home = normUrl(lead.website);
  const pages: { url: string; data: Any }[] = [];
  const first = await scrape(home);
  pages.push({ url: first.metadata?.sourceURL ?? home, data: first });
  const host = new URL(home).hostname.replace(/^www\./, "");
  const extra = (first.links ?? []).map(String).filter((l: string) => { try { return new URL(l).hostname.replace(/^www\./, "") === host && /contact|about/i.test(l); } catch { return false; } });
  for (const u of [...new Set(extra)].slice(0, 1)) { try { const d = await scrape(u as string); pages.push({ url: u as string, data: d }); } catch (_) { /* one page failing is fine */ } }

  const facts: Record<string, { value: unknown; source: string }> = {};
  const put = (k: string, v: unknown, src: string) => { if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return; if (!facts[k]) facts[k] = { value: v, source: src }; };
  const socials = new Map<string, string>();
  for (const p of pages) {
    const j = p.data.json ?? {};
    put("business_name", j.business_name, p.url); put("phone", j.phone, p.url);
    put("sells", j.sells, p.url);
    if (j.buys_cards === true) put("buys_cards", true, p.url);
    if (j.runs_events === true) put("runs_events", true, p.url);
    if (j.sells_online === true) put("sells_online", true, p.url);
    // Email only if it's literally written on the page (never guessed).
    const em = emailsInText(`${p.data.markdown ?? ""}\n${(p.data.links ?? []).join("\n")}`).find((e) => e.endsWith(host) ) ?? emailsInText(p.data.markdown ?? "")[0];
    put("email", em, p.url);
    for (const l of [...(p.data.links ?? []), ...(j.social_links ?? [])]) if (SOCIAL.test(String(l)) && !socials.has(String(l))) socials.set(String(l), p.url);
  }
  if (socials.size) facts.social_links = { value: [...socials.keys()].slice(0, 10), source: [...socials.values()][0] };
  const sells: string[] = (facts.sells?.value as string[]) ?? [];
  const score = fitScore({
    buysCards: !!facts.buys_cards, tcgFocus: sells.includes("tcg") || sells.includes("singles"), sports: sells.includes("sports"),
    otherCollectibles: sells.includes("other_collectibles") || sells.includes("comics"), activeSocial: socials.size > 0,
    events: !!facts.runs_events, publicEmail: !!facts.email, onlineStore: !!facts.sells_online,
    leadType: lead.lead_type, followers: lead.followers,
  });
  const upd: Any = {
    research: { ...(lead.research ?? {}), website: { facts, pages: pages.map((p) => p.url), at: new Date().toISOString() } },
    enrich_status: "done", enriched_at: new Date().toISOString(), enrich_attempts: (lead.enrich_attempts ?? 0) + 1, fit_score: score,
    stage: lead.stage === "new" ? "researched" : lead.stage,
  };
  if (!lead.email && facts.email) upd.email = facts.email.value;
  if (!lead.phone && facts.phone) upd.phone = String(facts.phone.value).slice(0, 40);
  if (!lead.business_name && facts.business_name) upd.business_name = facts.business_name.value;
  await db.from("agent_leads").update(upd).eq("id", lead.id);
  await db.from("agent_activities").insert({ lead_id: lead.id, type: "enriched", body: `Read ${pages.length} page(s); score ${score}${facts.email ? "; public email found" : ""}`, meta: { pages: pages.map((p) => p.url) } });
  return { id: lead.id, score, email: !!facts.email };
}

/** Enrich up to 50 leads; failures count an attempt and are retried at most twice. */
export async function enrichBatch(db: Any, ids?: string[], limit = ENRICH_BATCH_MAX, budgetMs = 330_000) {
  let q = db.from("agent_leads").select("id, website, lead_type, followers, research, enrich_attempts, enrich_status, email, phone, business_name, stage")
    .not("website", "is", null).is("merged_into", null).in("enrich_status", ["pending", "failed", "none"]).lt("enrich_attempts", 3);
  if (ids?.length) q = q.in("id", ids.slice(0, ENRICH_BATCH_MAX));
  const { data } = await q.order("created_at", { ascending: true }).limit(Math.min(limit, ENRICH_BATCH_MAX));
  const out = { enriched: 0, emails: 0, failed: 0, deferred: 0, results: [] as Any[] };
  const leads = (data ?? []).filter((l: Any) => shouldRetryEnrich(l.enrich_attempts ?? 0, l.enrich_status));
    // Firecrawl allows ~16 pages a minute on this plan, so go 2 at a time and stop at a time budget;
  // leftovers stay pending for the next run. Rate-limit misses don't use up a retry.
  const started = Date.now();
  for (let i = 0; i < leads.length; i += 2) {
    if (Date.now() - started > budgetMs) { out.deferred = leads.length - i; break; }
    await Promise.all(leads.slice(i, i + 2).map(async (l: Any) => {
      try { const r = await enrichOne(db, l); out.enriched++; if (r.email) out.emails++; out.results.push(r); }
      catch (e) {
        if (e instanceof RateLimited) { out.deferred++; await db.from("agent_leads").update({ enrich_status: "pending" }).eq("id", l.id); return; }
        out.failed++;
        await db.from("agent_leads").update({ enrich_status: "failed", enrich_attempts: (l.enrich_attempts ?? 0) + 1, research: { ...(l.research ?? {}), last_error: String((e as Error).message).slice(0, 300) } }).eq("id", l.id);
      }
    }));
  }
  return out;
}
