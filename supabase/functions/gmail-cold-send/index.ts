// Sends approved cold emails from connected Gmail inboxes (every 10 minutes).
// Claims through agent_claim_approved_emails (window, caps, suppression, consent checks live there),
// re-checks the stop-list and lane right before sending, adds the unsubscribe line + mailing address.
// Admin POST { "test_to": "..." } sends one sample so the footer and inbox can be checked first.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { assertLane, coldBodyProblem, marketingFooter } from "../_shared/lanes.ts";
import { isSuppressed, unsubscribeUrl } from "../_shared/outreach.ts";
import { buildRawEmail } from "../_shared/gmailRules.ts";
import { connKey, gmail } from "../_shared/gmail.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const ADDRESS = "306 W Redwood Street, Baltimore, MD 21201";

async function adminCaller(req: Request, db: Any) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth.slice(7));
  if (!data?.user?.id) return false;
  const [{ data: a }, { data: g }] = await Promise.all([db.rpc("is_admin", { _user_id: data.user.id }), db.from("agent_admins").select("user_id").eq("user_id", data.user.id).maybeSingle()]);
  return a === true || !!g;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: Any = {};
  try { body = await req.json(); } catch { /* cron may send none */ }

  if (body?.test_to) {
    if (!(await adminCaller(req, db))) return json({ error: "admins only" }, 403);
    const to = String(body.test_to).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "bad test_to" }, 400);
    const { data: acc } = await db.from("sending_accounts").select("*").eq("provider", "gmail").not("connection_secret", "is", null).order("created_at").limit(1).maybeSingle();
    const key = connKey(acc?.connection_secret);
    if (!acc || !key) return json({ error: "No connected Gmail inbox" }, 400);
    const unsub = await unsubscribeUrl(to);
    const text = `Hi,\n\nThis is a test copy of a MyCollectAI cold email, sent from ${acc.email}.\n\nDoes this land in your inbox?\n\nSimon` + marketingFooter(ADDRESS, unsub);
    try {
      const r = await gmail(key, "/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: buildRawEmail({ from: `${acc.display_name ?? "Simon"} <${acc.email}>`, to, subject: "[Test] MyCollectAI cold email", body: text, unsubscribeUrl: unsub }) }) });
      return json({ ok: true, from: acc.email, message_id: r.id });
    } catch (e) { return json({ error: String(e) }, 502); }
  }

  const authFail = authenticateCronRequest(req);
  if (authFail && !(await adminCaller(req, db))) return authFail;

  const { data: accs } = await db.from("sending_accounts").select("id, email, connection_secret").eq("provider", "gmail");
  const keyFor = new Map<string, string>();
  for (const a of accs ?? []) { const k = connKey(a.connection_secret); if (k) keyFor.set(a.id, k); }
  if (!keyFor.size) return json({ ok: true, note: "no connected inboxes" });

  const { data: rows, error } = await db.rpc("agent_claim_approved_emails");
  if (error) return json({ error: error.message }, 500);
  const log = { sent: 0, failed: 0, skipped: 0, released: 0 };
  for (const r of (rows ?? []) as Any[]) {
    const key = keyFor.get(r.sending_account_id);
    if (!key) { // inbox without a connection (e.g. handled by n8n): hand the row back
      await db.from("agent_outreach").update({ status: "approved", sending_account_id: null, claimed_at: null }).eq("id", r.id);
      log.released++; continue;
    }
    const to = String(r.to_email ?? "").trim().toLowerCase();
    try {
      assertLane("cold_inbox", { email: to, consent_email: false });
      if (await isSuppressed(db, to)) { await db.rpc("agent_mark_outreach", { p_id: r.id, p_status: "failed", p_error: "Suppressed address" }); log.skipped++; continue; }
      const unsub = await unsubscribeUrl(to);
      let text = String(r.body ?? "").trim();
      if (!/unsubscribe/i.test(text)) text += marketingFooter(r.physical_address || ADDRESS, unsub);
      const problem = coldBodyProblem(text, unsub);
      if (problem) { await db.rpc("agent_mark_outreach", { p_id: r.id, p_status: "failed", p_error: problem }); log.failed++; continue; }
      await gmail(key, "/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: buildRawEmail({ from: r.from_email, to, subject: r.subject ?? "", body: text, replyTo: r.reply_to, unsubscribeUrl: unsub }) }) });
      await db.rpc("agent_mark_outreach", { p_id: r.id, p_status: "sent", p_error: null });
      log.sent++;
    } catch (e) {
      console.error("send failed", r.id, String(e));
      await db.rpc("agent_mark_outreach", { p_id: r.id, p_status: "failed", p_error: String(e).slice(0, 500) });
      log.failed++;
    }
  }
  return json({ ok: true, ...log });
});
