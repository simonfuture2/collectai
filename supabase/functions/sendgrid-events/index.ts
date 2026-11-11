// SendGrid Event Webhook (opted-in lane). Verifies SendGrid's signature, records events, adds bounces,
// spam reports and unsubscribes to email_suppressions, and pauses broadcasts above the spam limit.
// Setup: SendGrid → Settings → Mail Settings → Event Webhook → URL = this function, enable Signed Event Webhook,
// copy the verification key into the SENDGRID_WEBHOOK_PUBLIC_KEY secret. JWT verification must be off.
import { createClient } from "npm:@supabase/supabase-js@2";
import { broadcastPauseReason, sendgridSuppressReason, SPAM_WINDOW_DAYS } from "../_shared/deliverability.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// DER ECDSA signature → raw r||s (64 bytes) for WebCrypto.
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => { i++; const len = der[i++]; const v = der.slice(i, i + len); i += len; return v; };
  const fix = (v: Uint8Array) => { const t = v[0] === 0 ? v.slice(1) : v; const o = new Uint8Array(32); o.set(t, 32 - t.length); return o; };
  const r = fix(read()), s = fix(read());
  const out = new Uint8Array(64); out.set(r); out.set(s, 32); return out;
}

async function verify(raw: string, sig: string, ts: string): Promise<boolean> {
  const pub = Deno.env.get("SENDGRID_WEBHOOK_PUBLIC_KEY")?.trim();
  if (!pub || !sig || !ts) return false;
  try {
    const key = await crypto.subtle.importKey("spki", b64(pub.replace(/-----[^-]+-----|\s/g, "")), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(b64(sig)), new TextEncoder().encode(ts + raw));
  } catch { return false; }
}

const EVENT_NAME: Record<string, string> = { bounce: "bounce", dropped: "bounce", spamreport: "complaint", unsubscribe: "unsubscribe", group_unsubscribe: "unsubscribe", delivered: "delivered" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const raw = await req.text();
  if (!Deno.env.get("SENDGRID_WEBHOOK_PUBLIC_KEY")) return new Response("SENDGRID_WEBHOOK_PUBLIC_KEY not set", { status: 503 });
  const ok = await verify(raw, req.headers.get("x-twilio-email-event-webhook-signature") ?? "", req.headers.get("x-twilio-email-event-webhook-timestamp") ?? "");
  if (!ok) return new Response("bad signature", { status: 401 });
  let events: Array<Record<string, any>>;
  try { events = JSON.parse(raw); if (!Array.isArray(events)) throw 0; } catch { return new Response("bad json", { status: 400 }); }

  let spamNew = 0;
  for (const e of events.slice(0, 2000)) {
    const name = EVENT_NAME[String(e.event)];
    if (!name) continue;
    const email = String(e.email ?? "").trim().toLowerCase();
    const reason = sendgridSuppressReason(e);
    if (name === "bounce" && !reason) continue; // temporary block
    const { error } = await db.from("email_events").insert({ provider: "sendgrid", event: name, email, ext_id: e.sg_event_id ? `sg:${e.sg_event_id}` : null, reason: String(e.reason ?? e.type ?? "").slice(0, 500) || null });
    if (error) continue; // duplicate delivery
    if (reason && email) await db.rpc("suppress_email", { _email: email, _reason: reason, _source: `sendgrid_${e.event}` });
    if (name === "complaint") spamNew++;
  }

  if (spamNew) {
    const since = new Date(Date.now() - SPAM_WINDOW_DAYS * 864e5).toISOString();
    const [{ count: spam }, { count: delivered }, { count: sent }] = await Promise.all([
      db.from("email_events").select("id", { count: "exact", head: true }).eq("provider", "sendgrid").eq("event", "complaint").gte("created_at", since),
      db.from("email_events").select("id", { count: "exact", head: true }).eq("provider", "sendgrid").eq("event", "delivered").gte("created_at", since),
      db.from("broadcast_recipients").select("id", { count: "exact", head: true }).eq("lane", "opted_in").eq("status", "sent").gte("sent_at", since),
    ]);
    const why = broadcastPauseReason({ spam: spam ?? 0, delivered: Math.max(delivered ?? 0, sent ?? 0) });
    if (why) {
      const { data: s } = await db.from("agent_settings").select("config").eq("key", "deliverability").maybeSingle();
      if (!s?.config?.broadcasts_paused_at) {
        await db.from("agent_settings").upsert({ key: "deliverability", enabled: true, config: { ...(s?.config ?? {}), broadcasts_paused_at: new Date().toISOString(), broadcasts_paused_reason: why }, updated_at: new Date().toISOString() });
      }
    }
  }
  return new Response("ok");
});
