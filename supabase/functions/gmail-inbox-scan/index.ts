// Every 30 minutes: read each connected cold inbox for bounce / complaint notices and real replies.
// Bounces -> agent_record_bounce (suppress, mark bounced, stop sequence, maybe pause inbox).
// Replies from leads -> agent_record_reply (stops the sequence). Auto-replies are ignored.
// Each handled message gets the hidden label "CollectAI/processed" so it is never counted twice.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { bounceKind, failedRecipient, isAutoReply, isBounceNotice, splitAddress } from "../_shared/gmailRules.ts";
import { batchGet, bodyText, connKey, ensureLabel, gmail, headerMap } from "../_shared/gmail.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
async function adminCaller(req: Request, db: Any) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth.slice(7));
  if (!data?.user?.id) return false;
  const [{ data: a }, { data: g }] = await Promise.all([db.rpc("is_admin", { _user_id: data.user.id }), db.from("agent_admins").select("user_id").eq("user_id", data.user.id).maybeSingle()]);
  return a === true || !!g;
}
const LABEL = "CollectAI/processed";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const authFail = authenticateCronRequest(req);
  if (authFail && !(await adminCaller(req, db))) return authFail;
  const { data: accs } = await db.from("sending_accounts").select("id, email, connection_secret").eq("provider", "gmail");
  const report: Any[] = [];
  for (const a of accs ?? []) {
    const key = connKey(a.connection_secret);
    if (!key) continue;
    const log = { inbox: a.email, bounces: 0, complaints: 0, replies: 0, auto: 0, unmatched: 0, error: null as string | null };
    try {
      const label = await ensureLabel(key, LABEL);
      const q = encodeURIComponent(`newer_than:7d -label:${LABEL.replace("/", "-")} -in:sent -in:chats`);
      const list = await gmail(key, `/users/me/messages?maxResults=50&q=${q}`);
      const ids: string[] = (list.messages ?? []).map((m: Any) => m.id);
      const msgs = await batchGet(key, ids);
      const done: string[] = [];
      for (const m of msgs) {
        const hs = headerMap(m);
        const msgId = hs["message-id"] || m.id;
        if (isBounceNotice(hs)) {
          const body = bodyText(m);
          const to = failedRecipient(hs, body, a.email);
          if (to) {
            const kind = bounceKind(hs, body);
            await db.rpc("agent_record_bounce", { p_email: to, p_kind: kind, p_outreach_id: null, p_reason: hs.subject?.slice(0, 200) ?? null, p_message_id: msgId });
            kind === "complaint" ? log.complaints++ : log.bounces++;
          } else log.unmatched++;
        } else {
          const from = splitAddress(hs.from ?? "").email;
          if (from && from !== a.email.toLowerCase()) {
            const { data: match } = await db.rpc("agent_match_reply", { p_from_email: from, p_message_id: msgId });
            if (match?.matched) {
              if (isAutoReply(hs)) log.auto++;
              else {
                await db.rpc("agent_record_reply", { p_lead_id: match.lead_id, p_message_id: msgId, p_from_email: from, p_subject: hs.subject ?? "", p_body: bodyText(m).slice(0, 5000), p_intent: null, p_summary: null });
                log.replies++;
              }
            }
          }
        }
        done.push(m.id);
      }
      if (done.length) await gmail(key, "/users/me/messages/batchModify", { method: "POST", body: JSON.stringify({ ids: done, addLabelIds: [label] }) });
      await db.from("sending_accounts").update({ last_checked_at: new Date().toISOString(), check_error: null }).eq("id", a.id);
    } catch (e) {
      log.error = String(e).slice(0, 500);
      await db.from("sending_accounts").update({ last_checked_at: new Date().toISOString(), check_error: log.error }).eq("id", a.id);
    }
    report.push(log);
  }
  return json({ ok: true, report });
});
