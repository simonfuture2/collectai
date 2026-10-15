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
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const ANON_EVENTS = new Set(["visit", "demo_scan"]);
const USER_EVENTS = new Set(["signup", "first_scan", "paid"]);
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

  const ref = (body.ref ?? "").trim();
  const event = body.event ?? "";
  if (!REF_RE.test(ref)) return json({ ok: false, reason: "no ref" });       // quietly ignore organic traffic
  if (!ANON_EVENTS.has(event) && !USER_EVENTS.has(event)) return json({ error: "event" }, 400);

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
    anon_id: typeof body.anon_id === "string" ? body.anon_id.slice(0, 64) : null,
    meta: body.meta && typeof body.meta === "object" ? body.meta : {},
  });
  // 23505 = already recorded for this user — fine
  if (error && error.code !== "23505") return json({ error: error.message }, 500);
  return json({ ok: true });
});
