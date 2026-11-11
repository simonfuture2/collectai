// Supabase Edge Function: agent-track
// Deploy:  supabase functions deploy agent-track --no-verify-jwt
//
//  POST /agent-track   { ref, event, anon_id }   -> logs an attribution event
//     - "visit" / "demo_scan" can be anonymous
//     - "signup" / "first_scan" / "paid" require the user's JWT (Authorization header);
//       user_id is taken from the token, never from the body
//  GET  /agent-track?unsub=<lead_id>              -> one-click email unsubscribe
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const ANON_EVENTS = new Set([
  "visit", "demo_scan", "landing_view", "demo_cta_click", "demo_upload_started", "demo_result",
  "demo_error", "demo_sample_tap", "demo_limit_hit", "save_card_click",
]);
const USER_EVENTS = new Set(["signup", "first_scan", "paid", "demo_card_imported"]);
// Anonymous flood guard (per hour).
const ANON_PER_ID_HOUR = 60;
const ANON_PER_IP_HOUR = 200;
async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const REF_RE = /^[a-z0-9_\-]{2,64}$/i;
const UUID_RE = /^[0-9a-f-]{36}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // ---- Unsubscribe link (from outreach emails) ----
  if (req.method === "GET" || req.method === "POST" && url.searchParams.has("unsub")) {
    const id = url.searchParams.get("unsub") ?? "";
    if (!UUID_RE.test(id)) return new Response("Invalid link", { status: 400 });
    await admin.rpc("agent_unsubscribe", { p_lead_id: id });
    return new Response(
      "<html><body style='font-family:sans-serif;padding:40px'>You're unsubscribed. You won't get any more emails from us.</body></html>",
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { ref?: string; event?: string; anon_id?: string; meta?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const rawRef = (body.ref ?? "").trim();
  const ref = REF_RE.test(rawRef) ? rawRef : "direct"; // organic traffic is tracked as "direct"
  const event = body.event ?? "";
  if (!ANON_EVENTS.has(event) && !USER_EVENTS.has(event)) return json({ error: "event" }, 400);
  const anonId = typeof body.anon_id === "string" && /^[0-9a-z-]{8,64}$/i.test(body.anon_id) ? body.anon_id : null;

  if (ANON_EVENTS.has(event)) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const ipHash = await sha256Hex(ip + ":agent-track");
    const checks = [admin.rpc("consume_ip_rate_limit", { _bucket_key: "agent_track_ip", _ip_hash: ipHash, _max_requests: ANON_PER_IP_HOUR, _window_seconds: 3600 })];
    if (anonId) checks.push(admin.rpc("consume_ip_rate_limit", { _bucket_key: "agent_track_anon", _ip_hash: await sha256Hex(anonId), _max_requests: ANON_PER_ID_HOUR, _window_seconds: 3600 }));
    const results = await Promise.all(checks);
    if (results.some((r) => r.error || !(r.data?.[0]?.allowed ?? false))) return json({ ok: false, reason: "rate limited" }, 429);
  }

  let userId: string | null = null;
  if (USER_EVENTS.has(event)) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: "auth required" }, 401);
    userId = data.user.id;
    if (event === "signup") {
      // remember the source on the profile if the column exists (ignore errors)
      await admin.from("profiles").update({ signup_ref: ref }).eq("id", userId).is("signup_ref", null);
    }
  }

  const { error } = await admin.from("agent_attribution").insert({
    ref_code: ref,
    event_type: event,
    user_id: userId,
    anon_id: anonId,
    meta: body.meta && typeof body.meta === "object" && JSON.stringify(body.meta).length <= 1000 ? body.meta : {},
  });
  // 23505 = already recorded for this user — fine
  if (error && error.code !== "23505") return json({ error: error.message }, 500);
  return json({ ok: true });
});
