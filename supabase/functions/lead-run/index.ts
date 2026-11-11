// Daily lead run (7:00 ET via scheduler; admins can also run it). Searches the next cities on the list,
// imports new shops, enriches up to 50 leads, assigns by territory and enrolls the best fits within cold capacity.
// Writes a summary row the Overview shows.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { adminUserId, enrichBatch, importPlaces, leadGenConfig, searchArea, STATE_CITIES, svc, type Any } from "../_shared/leadgen.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const SEQ_FOR: Record<string, string> = { card_shop: "card_shops", creator: "creators", collector: "collectors", seller: "card_shops" };

async function run(db: Any) {
  const cfg = await leadGenConfig(db);
  const c = cfg.raw;
  const cities: { city: string; state: string }[] = Array.isArray(c.run_cities) && c.run_cities.length ? c.run_cities
    : (STATE_CITIES.MD ?? []).map((city) => ({ city, state: "MD" }));
  const perDay = Math.max(0, Math.min(5, Number(c.cities_per_day ?? 2)));
  const cursor = Number(c.cursor ?? 0);
  const minScore = Number(c.enroll_min_score ?? 50);
  const territories: Record<string, string> = c.territories ?? {};
  const { data: admins } = await db.from("agent_admins").select("user_id").order("created_at").limit(1);
  const defaultOwner = c.default_owner ?? admins?.[0]?.user_id ?? null;
  const s: Any = { cities: [], found: 0, imported: 0, enriched: 0, emails_found: 0, enrolled: 0, skipped: {} as Record<string, number> };
  const skip = (why: string) => (s.skipped[why] = (s.skipped[why] ?? 0) + 1);

  for (let i = 0; i < perDay && cities.length; i++) {
    const t = cities[(cursor + i) % cities.length];
    try {
      const r = await searchArea(db, `${t.city}, ${t.state}`, Number(c.run_miles ?? 15), cfg.terms, cfg.placesDailyCap);
      s.found += r.hits.length; s.cities.push(`${t.city}, ${t.state}`);
      const imp = await importPlaces(db, r.hits, territories[t.state] ?? defaultOwner);
      s.imported += imp.imported.length;
      if (r.capped) { skip("daily search cap reached"); break; }
    } catch (e) { skip(`search failed: ${(e as Error).message.slice(0, 80)}`); }
  }
  await db.from("agent_settings").upsert({ key: "lead_gen", enabled: true, config: { ...c, cursor: (cursor + perDay) % Math.max(1, cities.length) } });

  const en = await enrichBatch(db, undefined, 50);
  s.enriched = en.enriched; s.emails_found = en.emails; if (en.failed) s.skipped["website unreadable (will retry)"] = en.failed;

  // Assign unowned leads by territory.
  const { data: unowned } = await db.from("agent_leads").select("id, state").is("owner_id", null).is("merged_into", null).limit(500);
  for (const l of unowned ?? []) { const o = territories[l.state] ?? defaultOwner; if (o) await db.from("agent_leads").update({ owner_id: o }).eq("id", l.id); }

  // Enroll the best fits within today's cold capacity.
  const { data: accts } = await db.from("sending_accounts").select("id").eq("active", true);
  let room = 0;
  for (const a of accts ?? []) { const { data: n } = await db.rpc("sending_account_capacity", { _id: a.id }); const { data: u } = await db.rpc("sending_account_used_today", { _id: a.id }); room += Math.max(0, Number(n ?? 0) - Number(u ?? 0)); }
  const { data: cands } = await db.from("agent_leads").select("id, email, lead_type, fit_score, do_not_contact, unsubscribed_at, stage")
    .is("merged_into", null).gte("fit_score", minScore).in("stage", ["new", "researched"]).not("email", "is", null).order("fit_score", { ascending: false }).limit(200);
  const { data: supp } = await db.from("email_suppressions").select("email");
  const suppressed = new Set((supp ?? []).map((r: Any) => String(r.email).toLowerCase()));
  const { data: seqs } = await db.from("agent_sequences").select("id, slug").eq("active", true);
  const seqBySlug = new Map((seqs ?? []).map((r: Any) => [r.slug, r.id]));
  for (const l of cands ?? []) {
    if (l.do_not_contact || l.unsubscribed_at) { skip("do not contact"); continue; }
    if (suppressed.has(String(l.email).toLowerCase())) { skip("suppressed address"); continue; }
    const seqId = seqBySlug.get(SEQ_FOR[l.lead_type] ?? "");
    if (!seqId) { skip("no active sequence for type"); continue; }
    if (room <= 0) { skip("no cold capacity today"); continue; }
    const { data: act } = await db.from("agent_enrollments").select("id").eq("lead_id", l.id).in("status", ["active", "paused"]).maybeSingle();
    if (act) { skip("already in a sequence"); continue; }
    const { error } = await db.rpc("agent_start_enrollment", { p_sequence_id: seqId, p_lead_id: l.id });
    if (error) skip(`enroll failed: ${error.message.slice(0, 60)}`); else { s.enrolled++; room--; }
  }
  await db.from("agent_lead_runs").insert({ kind: "daily", summary: s });
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = svc();
  const isAdmin = await adminUserId(req, db);
  if (!isAdmin) { const fail = authenticateCronRequest(req); if (fail) return fail; }
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(run(db).catch((e) => console.error("[lead-run]", e))); return json({ started: true }); }
  return json(await run(db));
});
