// Broadcasts: build an audience, preview, test, schedule, and (on a timer) send the opted-in lane.
// Cold-lane recipients become approved agent_outreach rows; the cold inbox claim (agent_claim_approved_emails)
// sends them through Gmail inboxes via n8n, or instantly-sync pushes them to Instantly.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assertLane, coldBodyProblem, exclusionReason, firstName, marketingFooter, nextWeekdays, pickLane, renderMerge, spreadDays, type Lane } from "../_shared/lanes.ts";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { sendgridMarketing, suppressedSet, unsubscribeUrl } from "../_shared/outreach.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Any = any;

interface Filters {
  lead_types?: string[]; stages?: string[]; sources?: string[]; tags?: string[]; states?: string[];
  contacted?: "any" | "contacted" | "never"; last_contacted_before?: string; never_replied?: boolean;
  include_leads?: boolean; include_users?: boolean; user_plans?: string[]; users_active_within_days?: number;
  lane?: "auto" | "cold" | "opted_in";
}
interface Recipient { lead_id: string | null; user_id: string | null; email: string; lane: Lane; fields: Record<string, string | null>; state: string | null }

async function settings(db: Any) {
  const { data } = await db.from("agent_settings").select("config").eq("key", "email_outreach").maybeSingle();
  const c = data?.config ?? {};
  return { address: String(c.physical_address ?? "306 W Redwood Street, Baltimore, MD 21201"), base: String(c.base_url ?? "https://mycollectai.com"), rep: String(c.rep_name ?? "P. Simon Batrony") };
}

async function buildAudience(db: Any, f: Filters) {
  const now = Date.now();
  const suppressed = await suppressedSet(db);
  const { data: seq } = await db.from("agent_enrollments").select("lead_id").in("status", ["active", "paused"]).not("lead_id", "is", null);
  const inSequence = new Set<string>((seq ?? []).map((r: Any) => r.lead_id));
  const excluded: Record<string, number> = {};
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const optInByUser = new Map<string, boolean>();
  { const { data } = await db.from("profiles").select("id, marketing_opt_in"); for (const p of data ?? []) optInByUser.set(p.id, !!p.marketing_opt_in); }
  const skip = (why: string) => { excluded[why] = (excluded[why] ?? 0) + 1; };

  if (f.include_leads !== false) {
    let q = db.from("agent_leads").select("*").is("merged_into", null).not("email", "is", null);
    if (f.lead_types?.length) q = q.in("lead_type", f.lead_types);
    if (f.stages?.length) q = q.in("stage", f.stages);
    if (f.sources?.length) q = q.in("source", f.sources);
    if (f.states?.length) q = q.in("state", f.states);
    if (f.tags?.length) q = q.overlaps("tags", f.tags);
    if (f.contacted === "contacted") q = q.not("last_contacted_at", "is", null);
    if (f.contacted === "never") q = q.is("last_contacted_at", null);
    if (f.last_contacted_before) q = q.lt("last_contacted_at", f.last_contacted_before);
    if (f.never_replied) q = q.is("replied_at", null);
    const { data: leads, error } = await q.limit(5000);
    if (error) throw new Error(error.message);
    for (const l of leads ?? []) {
      const why = exclusionReason(l, { suppressed, inSequence, now });
      if (why) { skip(why); continue; }
      const email = String(l.email).trim().toLowerCase();
      if (seen.has(email)) { skip("duplicate"); continue; }
      const lane = pickLane({ consent_email: l.consent_email, marketing_opt_in: l.user_id ? optInByUser.get(l.user_id) : false }) as Lane;
      if (f.lane && f.lane !== "auto" && f.lane !== lane) { skip(`not_${f.lane}`); continue; }
      seen.add(email);
      out.push({ lead_id: l.id, user_id: l.user_id, email, lane, state: l.state,
        fields: { first_name: firstName(l.name), business_name: l.business_name, city: l.city } });
    }
  }

  if (f.include_users) {
    const { data: au } = await db.auth.admin.listUsers({ perPage: 1000 });
    const { data: creds } = await db.from("user_credits").select("user_id, plan");
    const plan = new Map<string, string>((creds ?? []).map((c: Any) => [c.user_id, c.plan]));
    const { data: profs } = await db.from("profiles").select("id, display_name");
    const pname = new Map<string, string>((profs ?? []).map((p: Any) => [p.id, p.display_name]));
    for (const u of au?.users ?? []) {
      const email = String(u.email ?? "").toLowerCase();
      if (!email) continue;
      if (f.user_plans?.length && !f.user_plans.includes(plan.get(u.id) ?? "free")) continue;
      if (f.users_active_within_days && (!u.last_sign_in_at || now - Date.parse(u.last_sign_in_at) > f.users_active_within_days * 86400000)) continue;
      if (seen.has(email)) continue;
      if (!optInByUser.get(u.id)) { skip("no_marketing_opt_in"); continue; }
      if (suppressed.has(email)) { skip("suppressed"); continue; }
      if (f.lane === "cold") { skip("not_cold"); continue; }
      seen.add(email);
      out.push({ lead_id: null, user_id: u.id, email, lane: "opted_in", state: null, fields: { first_name: firstName(pname.get(u.id)), business_name: null, city: null } });
    }
  }
  return { recipients: out, excluded };
}

async function render(tpl: { subject: string; body: string }, r: Recipient, ref: string, cfg: Awaited<ReturnType<typeof settings>>) {
  const unsub = await unsubscribeUrl(r.email);
  const fields = { ...r.fields, ref_link: `${cfg.base}/?ref=${encodeURIComponent(ref)}`, rep_name: cfg.rep, unsubscribe_url: unsub, mailing_address: cfg.address };
  const subject = renderMerge(tpl.subject, fields);
  const text = renderMerge(tpl.body, fields) + marketingFooter(cfg.address, unsub);
  return { subject, text, unsub };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // Timer: send due opted-in recipients. Callable by the scheduler or an admin.
    const auth = req.headers.get("Authorization") ?? "";
    let userId: string | null = null; let userEmail: string | null = null;
    if (auth.startsWith("Bearer ") && action !== "tick") {
      const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth.slice(7));
      userId = data?.user?.id ?? null; userEmail = data?.user?.email ?? null;
    }
    const isCron = authenticateCronRequest(req) === null;
    let isAdminUser = false;
    if (userId) {
      const [{ data: a }, { data: g }] = await Promise.all([
        db.rpc("is_admin", { _user_id: userId }),
        db.from("agent_admins").select("user_id").eq("user_id", userId).maybeSingle(),
      ]);
      isAdminUser = a === true || !!g;
    }
    if (action === "tick") { if (!isCron && !isAdminUser) return json({ error: "Unauthorized" }, 401); }
    else if (!isAdminUser) return json({ error: "Admin access required" }, 403);

    const cfg = await settings(db);

    if (action === "audience") {
      const { recipients, excluded } = await buildAudience(db, body.filters ?? {});
      const counts = { cold: recipients.filter((r) => r.lane === "cold").length, opted_in: recipients.filter((r) => r.lane === "opted_in").length };
      let samples: Any[] = [];
      if (body.template_id) {
        const { data: tpl } = await db.from("email_templates").select("*").eq("id", body.template_id).single();
        const pick = [...recipients].sort(() => Math.random() - 0.5).slice(0, 3);
        samples = await Promise.all(pick.map(async (r) => ({ email: r.email, lane: r.lane, ...(await render(tpl, r, body.ref_code || "bc_preview", cfg)) })));
        if (tpl) for (const s of samples) if (s.lane === "cold") s.problem = coldBodyProblem(s.text, s.unsub);
      }
      const { data: accs } = await db.from("sending_accounts").select("id").eq("active", true);
      let capacity = 0; for (const a of accs ?? []) capacity += Number((await db.rpc("sending_account_capacity", { _id: a.id })).data ?? 0);
      const cap = { capacity, inboxes: accs?.length ?? 0 };
      return json({ counts, excluded, samples, total: recipients.length, cold_capacity: cap });
    }

    if (action === "test") {
      if (!userEmail) throw new Error("No email on your account");
      const { data: tpl } = await db.from("email_templates").select("*").eq("id", body.template_id).single();
      if (!tpl) throw new Error("Template not found");
      const fake: Recipient = { lead_id: null, user_id: userId, email: userEmail, lane: "opted_in", state: null, fields: { first_name: "Simon", business_name: "Your Card Shop", city: "Baltimore" } };
      const m = await render(tpl, fake, body.ref_code || "bc_test", cfg);
      await sendgridMarketing(userEmail, `[TEST ${tpl.lane}] ${m.subject}`, m.text, m.unsub, { test: true });
      await db.from("email_send_log").insert({ template_name: `broadcast_test:${tpl.id}`, recipient_email: userEmail, status: "sent" });
      return json({ ok: true, sent_to: userEmail });
    }

    if (action === "create") {
      const { name, template_id, filters, spread_days = 1, ref_code } = body;
      if (!name || !template_id) throw new Error("Name and template are required");
      const { data: tpl } = await db.from("email_templates").select("*").eq("id", template_id).single();
      if (!tpl) throw new Error("Template not found");
      const ref = String(ref_code || "").trim() || `bc_${crypto.randomUUID().slice(0, 8)}`;
      const { recipients } = await buildAudience(db, filters ?? {});
      if (!recipients.length) throw new Error("Nobody matches this audience");
      const { data: bc, error } = await db.from("broadcasts").insert({ name, template_id, filters: filters ?? {}, spread_days, ref_code: ref, status: "scheduled", created_by: userId, scheduled_at: new Date().toISOString() }).select().single();
      if (error) throw new Error(error.message);

      const { data: capRows } = await db.from("sending_accounts").select("id").eq("active", true).eq("provider", "gmail");
      let coldCap = 0; for (const a of capRows ?? []) { const { data: c } = await db.rpc("sending_account_capacity", { _id: a.id }); coldCap += Number(c ?? 0); }
      const days = nextWeekdays(new Date(), Math.max(60, spread_days * 3));
      for (const lane of ["cold", "opted_in"] as Lane[]) {
        const list = recipients.filter((r) => r.lane === lane);
        const idx = spreadDays(list.length, spread_days, lane === "cold" && coldCap > 0 ? coldCap : undefined);
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          // cold: from 8:30 New York on its day (the claim re-checks the recipient's own hours); opted-in: 10:00 New York.
          const when = new Date(`${days[idx[i]]}T${lane === "cold" ? "13:30" : "15:00"}:00Z`);
          const sched = new Date(Math.max(when.getTime(), Date.now())).toISOString();
          const m = await render(tpl, r, ref, cfg);
          let outreach_id: string | null = null; let status = "queued"; let err: string | null = null;
          if (lane === "cold") {
            const problem = coldBodyProblem(m.text, m.unsub);
            if (problem) { status = "skipped"; err = problem; }
            else {
              const { data: o, error: oe } = await db.from("agent_outreach").insert({
                lead_id: r.lead_id, workflow: "email_outreach", channel: "email", external_ref: `bc:${bc.id}:${r.lead_id}`,
                subject: m.subject, draft_text: m.text, final_text: m.text, ref_code: ref, status: "approved",
                decided_at: new Date().toISOString(), scheduled_for: sched, broadcast_id: bc.id,
              }).select("id").single();
              if (oe) { status = "failed"; err = oe.message; } else outreach_id = o.id;
            }
          }
          await db.from("broadcast_recipients").insert({ broadcast_id: bc.id, lead_id: r.lead_id, user_id: r.user_id, email: r.email, lane, scheduled_for: sched, status, outreach_id, error: err });
        }
      }
      return json({ ok: true, id: bc.id, ref_code: ref });
    }

    if (action === "cancel") {
      await db.from("broadcasts").update({ status: "cancelled" }).eq("id", body.id);
      const { data: rows } = await db.from("broadcast_recipients").update({ status: "cancelled" }).eq("broadcast_id", body.id).eq("status", "queued").select("outreach_id");
      const ids = (rows ?? []).map((r: Any) => r.outreach_id).filter(Boolean);
      if (ids.length) await db.from("agent_outreach").update({ status: "skipped", error: "Broadcast cancelled" }).in("id", ids).eq("status", "approved");
      return json({ ok: true });
    }

    if (action === "stats") {
      const { data: bcs } = await db.from("broadcasts").select("*, email_templates(name, lane)").order("created_at", { ascending: false }).limit(50);
      const out = [];
      for (const b of bcs ?? []) {
        const { data: rs } = await db.from("broadcast_recipients").select("lane, status, replied_at, unsubscribed_at, lead_id, email").eq("broadcast_id", b.id);
        const leadIds = (rs ?? []).map((r: Any) => r.lead_id).filter(Boolean);
        const { data: replied } = leadIds.length ? await db.from("agent_leads").select("id, replied_at, unsubscribed_at").in("id", leadIds).gt("replied_at", b.created_at) : { data: [] };
        const { data: unsub } = await db.from("email_suppressions").select("email").in("email", (rs ?? []).map((r: Any) => r.email)).gt("created_at", b.created_at);
        const { count: signups } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("signup_ref", b.ref_code);
        const c = (st: string) => (rs ?? []).filter((r: Any) => r.status === st).length;
        out.push({ ...b, total: rs?.length ?? 0, cold: (rs ?? []).filter((r: Any) => r.lane === "cold").length, opted_in: (rs ?? []).filter((r: Any) => r.lane === "opted_in").length,
          queued: c("queued") + c("sending"), sent: c("sent"), failed: c("failed") + c("skipped"), bounced: c("bounced"),
          replied: replied?.length ?? 0, unsubscribed: unsub?.length ?? 0, signups: signups ?? 0 });
      }
      return json({ broadcasts: out });
    }

    if (action === "tick") {
      const { data: due } = await db.from("broadcast_recipients").select("*, broadcasts!inner(status, ref_code, template_id)")
        .eq("lane", "opted_in").eq("status", "queued").lte("scheduled_for", new Date().toISOString()).neq("broadcasts.status", "cancelled").limit(100);
      const suppressed = await suppressedSet(db);
      let sent = 0, failed = 0;
      const tpls = new Map<string, Any>();
      for (const r of due ?? []) {
        try {
          // Re-check at send time.
          let consent = false, mopt = false;
          if (r.lead_id) {
            const { data: l } = await db.from("agent_leads").select("*").eq("id", r.lead_id).single();
            if (!l || exclusionReason(l, { suppressed, inSequence: new Set(), now: Date.now() })) throw new Error("skip:no longer eligible");
            consent = !!l.consent_email;
            if (l.user_id) mopt = !!(await db.from("profiles").select("marketing_opt_in").eq("id", l.user_id).maybeSingle()).data?.marketing_opt_in;
          }
          if (r.user_id) mopt = mopt || !!(await db.from("profiles").select("marketing_opt_in").eq("id", r.user_id).maybeSingle()).data?.marketing_opt_in;
          if (suppressed.has(r.email)) throw new Error("skip:suppressed");
          assertLane("sendgrid", { email: r.email, consent_email: consent, marketing_opt_in: mopt });
          const tid = r.broadcasts.template_id;
          if (!tpls.has(tid)) tpls.set(tid, (await db.from("email_templates").select("*").eq("id", tid).single()).data);
          let fields: Record<string, string | null> = { first_name: null, business_name: null, city: null };
          if (r.lead_id) { const { data: l } = await db.from("agent_leads").select("name,business_name,city").eq("id", r.lead_id).single(); fields = { first_name: firstName(l?.name), business_name: l?.business_name, city: l?.city }; }
          const m = await render(tpls.get(tid), { ...r, fields, state: null }, r.broadcasts.ref_code, cfg);
          await sendgridMarketing(r.email, m.subject, m.text, m.unsub);
          await db.from("broadcast_recipients").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", r.id);
          if (r.lead_id) {
            await db.from("agent_leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", r.lead_id);
            await db.from("agent_activities").insert({ lead_id: r.lead_id, type: "broadcast_sent", body: m.subject, meta: { broadcast_id: r.broadcast_id, lane: "opted_in" } });
          }
          sent++;
        } catch (e) {
          const msg = (e as Error).message;
          const skip = msg.startsWith("skip:") || msg.startsWith("Refused");
          await db.from("broadcast_recipients").update({ status: skip ? "skipped" : "failed", error: msg.replace(/^skip:/, "") }).eq("id", r.id);
          if (!skip && /SENDGRID_UNSUB_GROUP_ID/.test(msg)) { await db.from("broadcast_recipients").update({ status: "queued" }).eq("id", r.id); break; }
          if (skip) console.warn("broadcast lane/eligibility refusal", r.email, msg); else failed++;
        }
      }
      // Finish broadcasts with nothing left to send.
      const { data: open } = await db.from("broadcasts").select("id").in("status", ["scheduled", "sending"]);
      for (const b of open ?? []) {
        const { count } = await db.from("broadcast_recipients").select("id", { count: "exact", head: true }).eq("broadcast_id", b.id).in("status", ["queued", "sending"]);
        await db.from("broadcasts").update({ status: count ? "sending" : "done" }).eq("id", b.id);
      }
      return json({ sent, failed });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("broadcast-send", e);
    return json({ error: (e as Error).message }, 500);
  }
});
