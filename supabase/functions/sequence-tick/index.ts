// Sequence engine timer (every 5 minutes). For each due enrollment:
//  - stop it if the person replied, unsubscribed, bounced, signed up or changed stage (rules in _shared/sequenceRules.ts)
//  - template email steps -> agent_outreach rows: cold rows go to the cold inbox queue (workflow email_outreach),
//    opted-in rows (workflow sequence_optin) are sent here through SendGrid
//  - call / DM steps -> a task in the Inbox, and the sequence moves on
//  - AI-written steps (no template) wait for n8n (agent-gateway: agent_next_steps_to_draft)
// Also sends approved opted-in sequence emails. Callable by the scheduler or an admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { assertLane, firstName, marketingFooter, renderMerge } from "../_shared/lanes.ts";
import { canAutoApprove, decide, linkProblem, type SeqLane } from "../_shared/sequenceRules.ts";
import { sendgridMarketing, suppressedSet, unsubscribeUrl } from "../_shared/outreach.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const nyDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

async function isAdminCaller(req: Request, db: Any) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth.slice(7));
  const uid = data?.user?.id;
  if (!uid) return false;
  const [{ data: a }, { data: g }] = await Promise.all([db.rpc("is_admin", { _user_id: uid }), db.from("agent_admins").select("user_id").eq("user_id", uid).maybeSingle()]);
  return a === true || !!g;
}

async function config(db: Any) {
  const { data } = await db.from("agent_settings").select("key, config").in("key", ["email_outreach", "sequence_links"]);
  const m = Object.fromEntries((data ?? []).map((r: Any) => [r.key, r.config ?? {}]));
  const eo = m.email_outreach ?? {}, sl = m.sequence_links ?? {};
  return {
    address: String(eo.physical_address ?? "306 W Redwood Street, Baltimore, MD 21201"), base: String(eo.base_url ?? "https://mycollectai.com"),
    rep: String(sl.rep_signature ?? "Simon"), booking: String(sl.booking_url ?? ""), video: String(sl.video_url ?? ""),
    optinCap: Number(sl.optin_daily_cap ?? 300),
  };
}

async function coldCapacityLeft(db: Any) {
  const { data: accs } = await db.from("sending_accounts").select("id").eq("active", true).eq("provider", "gmail");
  let left = 0;
  for (const a of accs ?? []) {
    const [{ data: cap }, { data: used }] = await Promise.all([db.rpc("sending_account_capacity", { _id: a.id }), db.rpc("sending_account_used_today", { _id: a.id })]);
    left += Math.max(0, Number(cap ?? 0) - Number(used ?? 0));
  }
  const { count } = await db.from("agent_outreach").select("id", { count: "exact", head: true }).eq("workflow", "email_outreach").eq("status", "approved");
  return left - (count ?? 0);
}

async function optinLeft(db: Any, cap: number) {
  const start = new Date(`${nyDay()}T00:00:00-05:00`).toISOString();
  const { count } = await db.from("agent_outreach").select("id", { count: "exact", head: true }).eq("workflow", "sequence_optin").eq("status", "sent").gte("sent_at", start);
  return cap - (count ?? 0);
}

async function personFor(db: Any, e: Any) {
  if (e.lead_id) {
    const { data: l } = await db.from("agent_leads").select("*").eq("id", e.lead_id).single();
    let mopt = false;
    if (l?.user_id) mopt = !!(await db.from("profiles").select("marketing_opt_in").eq("id", l.user_id).maybeSingle()).data?.marketing_opt_in;
    return { lead: l, email: l?.email ? String(l.email).trim().toLowerCase() : "", name: l?.name, business: l?.business_name, city: l?.city, state: l?.state, consent: !!l?.consent_email, mopt, isUser: false };
  }
  const { data: u } = await db.auth.admin.getUserById(e.user_id);
  const { data: p } = await db.from("profiles").select("display_name, marketing_opt_in").eq("id", e.user_id).maybeSingle();
  const email = String(u?.user?.email ?? "").trim().toLowerCase();
  return { lead: { email }, email, name: p?.display_name, business: null, city: null, state: null, consent: false, mopt: !!p?.marketing_opt_in, isUser: true };
}

async function sendOptin(db: Any, o: Any, email: string, consent: boolean, mopt: boolean, cfg: Any) {
  assertLane("sendgrid", { email, consent_email: consent, marketing_opt_in: mopt });
  const unsub = await unsubscribeUrl(email);
  await sendgridMarketing(email, o.subject ?? "MyCollectAI", String(o.final_text ?? o.draft_text ?? "") + marketingFooter(cfg.address, unsub), unsub);
  await db.rpc("agent_mark_outreach", { p_id: o.id, p_status: "sent", p_error: null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (authenticateCronRequest(req) !== null && !(await isAdminCaller(req, db))) return json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const cfg = await config(db);
  const suppressed = await suppressedSet(db);
  let coldLeft = await coldCapacityLeft(db);
  let optLeft = await optinLeft(db, cfg.optinCap);
  const log = { checked: 0, stopped: 0, waiting: 0, queued: 0, tasks: 0, sent: 0, failed: 0, ai_waiting: 0, notes: [] as string[] };

  const { data: due, error } = await db.from("agent_enrollments")
    .select("*, agent_sequences!inner(id, slug, name, lane, active, auto_approve, approved_unedited)")
    .eq("status", "active").lte("next_due_at", now.toISOString()).eq("agent_sequences.active", true)
    .order("next_due_at").limit(200);
  if (error) return json({ error: error.message }, 500);

  for (const e of due ?? []) {
    log.checked++;
    try {
      const seq = e.agent_sequences; const lane = seq.lane as SeqLane;
      const { data: steps } = await db.from("agent_sequence_steps").select("*, email_templates(subject, body)").eq("sequence_id", e.sequence_id).order("step_no");
      const step = (steps ?? []).find((s: Any) => s.step_no === e.current_step);
      if (!step) { await db.rpc("agent_advance_enrollment", { p_enrollment_id: e.id, p_from_step: e.current_step }); continue; }
      const firstStep = steps![0].step_no;
      const { data: existing } = await db.from("agent_outreach").select("id, status").eq("enrollment_id", e.id).eq("step_id", step.id).maybeSingle();
      if (existing) continue; // waiting for approval / n8n / the cold inbox
      const p = await personFor(db, e);
      const isTest = !!e.clock_minutes;
      const capacityLeft = isTest ? 1 : lane === "cold" ? coldLeft : optLeft;
      const d = decide({ now, lane, channel: step.channel, lead: p.lead ?? {}, state: p.state, suppressed, lastEmailAt: e.last_email_at,
        clockMinutes: e.clock_minutes, capacityLeft, marketingOptIn: p.mopt, isUserEnrollment: p.isUser });
      if (d.kind === "stop") {
        await db.rpc("agent_stop_enrollment", { p_enrollment_id: e.id, p_status: d.status, p_reason: d.reason }); log.stopped++; continue;
      }
      if (d.kind === "wait") { await db.from("agent_enrollments").update({ next_due_at: d.until.toISOString() }).eq("id", e.id); log.waiting++; continue; }

      const unsub = p.email ? await unsubscribeUrl(p.email) : "";
      const fields = { first_name: firstName(p.name), business_name: p.business, city: p.city, rep_name: cfg.rep, booking_link: cfg.booking, video_link: cfg.video,
        base_url: cfg.base, ref_link: `${cfg.base}/?ref=seq_${seq.slug ?? seq.id.slice(0, 8)}`, unsubscribe_url: unsub, mailing_address: cfg.address };
      const ref = `seq_${seq.slug ?? seq.id.slice(0, 8)}`;

      if (step.channel !== "email") {
        await db.from("agent_outreach").insert({ lead_id: e.lead_id, workflow: "sequence_task", channel: step.channel, status: "pending",
          enrollment_id: e.id, step_id: step.id, subject: `${seq.name} · step ${step.step_no}`, draft_text: renderMerge(step.angle ?? "", fields), ref_code: ref });
        await db.rpc("agent_advance_enrollment", { p_enrollment_id: e.id, p_from_step: step.step_no });
        log.tasks++; continue;
      }
      if (!step.template_id) { log.ai_waiting++; continue; } // n8n drafts this one

      const body = renderMerge(step.email_templates.body ?? "", fields);
      const subject = renderMerge(step.email_templates.subject ?? "", fields);
      const problem = linkProblem(body, { lane, isFirstStep: step.step_no === firstStep, unsubscribeUrl: unsub });
      const auto = !problem && canAutoApprove({ stepNo: step.step_no, firstStepNo: firstStep, requireApproval: step.require_approval, autoApprove: seq.auto_approve, approvedUnedited: seq.approved_unedited });
      if (lane === "cold") assertLane("cold_inbox", { email: p.email, consent_email: p.consent, marketing_opt_in: p.mopt });
      else assertLane("sendgrid", { email: p.email, consent_email: p.consent, marketing_opt_in: p.mopt });
      const text = lane === "cold" ? body + marketingFooter(cfg.address, unsub) : body;
      const { data: o, error: oe } = await db.from("agent_outreach").insert({
        lead_id: e.lead_id, workflow: lane === "cold" ? "email_outreach" : "sequence_optin", channel: "email",
        status: auto ? "approved" : "pending", decided_at: auto ? now.toISOString() : null, error: problem,
        enrollment_id: e.id, step_id: step.id, subject, draft_text: text, final_text: text, ref_code: ref,
        external_ref: p.isUser ? `user:${e.user_id}` : null,
      }).select().single();
      if (oe) throw new Error(oe.message);
      log.queued++;
      if (lane === "cold") coldLeft--;
      else if (auto) {
        try { await sendOptin(db, o, p.email, p.consent, p.mopt, cfg); optLeft--; log.sent++; }
        catch (err) { await db.from("agent_outreach").update({ status: "approved", error: (err as Error).message }).eq("id", o.id); log.notes.push((err as Error).message); }
      }
    } catch (err) {
      log.failed++; log.notes.push(`${e.id}: ${(err as Error).message}`);
      console.error("sequence-tick enrollment failed", e.id, err);
    }
  }

  // Approved opted-in sequence emails that still need sending (approved in the Inbox or retried).
  const { data: approved } = await db.from("agent_outreach").select("*").eq("workflow", "sequence_optin").eq("status", "approved").limit(100);
  for (const o of approved ?? []) {
    if (optLeft <= 0) break;
    try {
      const { data: e } = o.enrollment_id ? await db.from("agent_enrollments").select("*").eq("id", o.enrollment_id).maybeSingle() : { data: null };
      const p = e ? await personFor(db, e) : await personFor(db, { lead_id: o.lead_id });
      if (!p.email || suppressed.has(p.email)) { await db.rpc("agent_mark_outreach", { p_id: o.id, p_status: "skipped", p_error: "suppressed" }); continue; }
      await sendOptin(db, o, p.email, p.consent, p.mopt, cfg); optLeft--; log.sent++;
    } catch (err) {
      const msg = (err as Error).message;
      await db.from("agent_outreach").update({ error: msg }).eq("id", o.id);
      log.notes.push(msg);
      if (/SENDGRID|SendGrid/.test(msg)) break;
    }
  }
  return json(log);
});
