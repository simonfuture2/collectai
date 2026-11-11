// Every 15 minutes: push approved cold emails to Instantly, pull back replies and bounces.
// Does nothing until INSTANTLY_API_KEY is set and agent_settings 'instantly' is enabled with a campaign_id.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { instantly } from "../_shared/coldProviders.ts";
import { coldWindowOpen, inboxCapacity, pickLane } from "../_shared/lanes.ts";
import { suppressedSet } from "../_shared/outreach.ts";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = authenticateCronRequest(req);
  if (denied) return denied;
  const key = Deno.env.get("INSTANTLY_API_KEY");
  if (!key) return json({ skipped: "INSTANTLY_API_KEY not set" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: s } = await db.from("agent_settings").select("*").eq("key", "instantly").maybeSingle();
  const campaignId = s?.config?.campaign_id;
  if (!s?.enabled || !campaignId) return json({ skipped: "Instantly not enabled" });
  const p = instantly(key);
  const out = { pushed: 0, failed: 0, replies: 0, bounces: 0 };

  // Capacity = sum of active Instantly accounts (with warm-up) minus what they took today.
  const today = new Date().toISOString().slice(0, 10);
  const { data: accts } = await db.from("sending_accounts").select("*").eq("provider", "instantly").eq("active", true);
  let room = 0;
  for (const a of accts ?? []) room += Math.max(0, inboxCapacity(a, today) - (a.last_sent_at?.slice(0, 10) === today ? a.sent_today : 0));
  if (room > 0) {
    const suppressed = await suppressedSet(db);
    const { data: rows } = await db.from("agent_outreach").select("id, subject, final_text, draft_text, scheduled_for, agent_leads!inner(email, name, business_name, state, consent_email, do_not_contact, merged_into)")
      .eq("workflow", "email_outreach").eq("status", "approved").limit(200);
    const due = (rows ?? []).filter((r: any) => {
      const l = r.agent_leads;
      return l.email && !l.do_not_contact && !l.merged_into && pickLane({ consent_email: l.consent_email }) === "cold"
        && !suppressed.has(String(l.email).toLowerCase()) && (!r.scheduled_for || r.scheduled_for <= new Date().toISOString()) && coldWindowOpen(new Date(), l.state);
    }).slice(0, room);
    // Claim them first so the Gmail inboxes don't also take them.
    const ids = due.map((r: any) => r.id);
    if (ids.length) await db.from("agent_outreach").update({ status: "sending", claimed_at: new Date().toISOString(), provider_ref: "instantly" }).in("id", ids).eq("status", "approved");
    const res = await p.pushLeads(campaignId, due.map((r: any) => ({ outreach_id: r.id, email: r.agent_leads.email, first_name: (r.agent_leads.name ?? "").split(" ")[0], company_name: r.agent_leads.business_name, subject: r.subject ?? "", body: r.final_text ?? r.draft_text ?? "" })));
    for (const id of res.ok) await db.rpc("agent_mark_outreach", { p_id: id, p_status: "sent", p_error: null });
    for (const f of res.failed) await db.rpc("agent_mark_outreach", { p_id: f.outreach_id, p_status: "failed", p_error: f.error });
    out.pushed = res.ok.length; out.failed = res.failed.length;
    if (accts?.[0] && res.ok.length) await db.from("sending_accounts").update({ last_sent_at: new Date().toISOString(), sent_today: (accts[0].last_sent_at?.slice(0, 10) === today ? accts[0].sent_today : 0) + res.ok.length }).eq("id", accts[0].id);
  }

  const since = s.config?.last_sync ?? new Date(Date.now() - 86400000).toISOString();
  for (const r of await p.replies(campaignId, since)) {
    const { data: m } = await db.rpc("agent_match_reply", { p_from_email: r.from_email, p_message_id: r.message_id });
    if (!m?.matched) continue;
    const unsub = /unsubscribe|remove me|stop emailing|take me off/i.test(r.body);
    await db.rpc("agent_record_reply", { p_lead_id: m.lead_id, p_message_id: r.message_id, p_from_email: r.from_email, p_subject: r.subject, p_body: r.body, p_intent: unsub ? "unsubscribe" : "other", p_summary: r.body.slice(0, 200) });
    out.replies++;
  }
  for (const email of await p.bounces(campaignId)) {
    await db.rpc("suppress_email", { _email: email, _reason: "bounced", _source: "instantly" });
    out.bounces++;
  }
  await db.from("agent_settings").update({ config: { ...s.config, last_sync: new Date().toISOString() } }).eq("key", "instantly");
  return json(out);
});
