// Monday 8:00 ET summary email to the owner: last week's numbers, top replies needing attention,
// partners activated and sending health warnings. Internal account email via the email queue.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { isMondayEightET, trend } from "../_shared/deliverability.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const J = (b: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(b), { ...init, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body = await request.json().catch(() => ({})) as { force?: boolean; to?: string };
  const authFailure = authenticateCronRequest(request);
  if (authFailure) {
    // An admin can send a test copy now from the Email health card.
    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } } });
    const { data: ok } = await user.rpc("is_agent_admin");
    if (!ok) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    body = { force: true, to: body.to };
  }
  const now = new Date();
  if (!body.force && !isMondayEightET(now)) return J({ skipped: "not Monday 8am ET" });

  const { data: cfg } = await db.from("agent_settings").select("enabled, config").eq("key", "weekly_summary").maybeSingle();
  if (!body.force && cfg && !cfg.enabled) return J({ skipped: "turned off" });
  const to = String(body.to || cfg?.config?.to || "").trim();
  if (!to) return J({ error: "no recipient" }, { status: 400 });

  const until = new Date(now); const since = new Date(now.getTime() - 7 * 864e5); const prevSince = new Date(now.getTime() - 14 * 864e5);
  const [{ data: cur, error }, { data: prev }] = await Promise.all([
    db.rpc("results_report", { _since: since.toISOString(), _until: until.toISOString() }),
    db.rpc("results_report", { _since: prevSince.toISOString(), _until: since.toISOString() }),
  ]);
  if (error) return J({ error: error.message }, { status: 500 });
  const t = (cur as any).totals, p = (prev as any)?.totals ?? {};

  const { data: replies } = await db.from("agent_replies").select("from_email, subject, summary, intent, received_at, agent_leads!inner(name, business_name, stage)")
    .gte("received_at", since.toISOString()).neq("intent", "auto_reply").eq("agent_leads.stage", "replied").order("received_at", { ascending: false }).limit(30);
  const top = (replies ?? []).sort((a: any, b: any) => Number(b.intent === "interested") - Number(a.intent === "interested")).slice(0, 5);

  const { data: accts } = await db.from("sending_accounts").select("email, active, paused_reason");
  const { data: dl } = await db.from("agent_settings").select("config").eq("key", "deliverability").maybeSingle();
  const warnings: string[] = [];
  for (const a of accts ?? []) if (!a.active && a.paused_reason) warnings.push(`${a.email}: ${a.paused_reason}`);
  if (dl?.config?.broadcasts_paused_at) warnings.push(`Broadcasts paused: ${dl.config.broadcasts_paused_reason}`);
  if (t.bounces) warnings.push(`${t.bounces} bounce(s) last week`);
  if (t.complaints) warnings.push(`${t.complaints} spam complaint(s) last week`);

  const rows: [string, string][] = [["Emails sent", "sent"], ["Replies", "replies"], ["Interested", "interested"], ["Meetings booked", "meetings"], ["New leads", "new_leads"], ["Sign-ups", "signups"]];
  const arrow = (k: string) => { const r = trend(Number(t[k] ?? 0), Number(p[k] ?? 0)); return r.dir === "up" ? "▲" : r.dir === "down" ? "▼" : "–"; };
  const partners: string[] = (cur as any).partners_activated ?? [];
  const lines = [
    `Last week (${since.toDateString()} – ${until.toDateString()})`, "",
    ...rows.map(([l, k]) => `${l}: ${t[k] ?? 0} ${arrow(k)} (week before: ${p[k] ?? 0})`), "",
    `Active partner shops: ${(cur as any).active_shops}`, `Partners activated: ${partners.length ? partners.join(", ") : "none"}`, "",
    "Replies needing attention:", ...(top.length ? top.map((r: any) => `- ${r.agent_leads?.business_name || r.agent_leads?.name || r.from_email}${r.intent === "interested" ? " (interested)" : ""}: ${r.summary || r.subject || ""}`) : ["- none"]), "",
    "Sending health:", ...(warnings.length ? warnings.map((w) => `- ${w}`) : ["- all good"]), "",
    "Open the admin area: https://mycollectai.com/admin#results",
  ];
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">${lines.map((l) => l ? `<div>${esc(l)}</div>` : "<br>").join("")}</div>`;
  const week = since.toISOString().slice(0, 10);
  const id = `weekly-summary-${week}-${to}`;
  // Account emails must carry an unsubscribe token; reuse the recipient's or make one.
  let token = (await db.from("email_unsubscribe_tokens").select("token").eq("email", to.toLowerCase()).is("used_at", null).limit(1).maybeSingle()).data?.token as string | undefined;
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    await db.from("email_unsubscribe_tokens").insert({ token, email: to.toLowerCase() });
  }
  const { error: qErr } = await db.rpc("enqueue_email", { queue_name: "transactional_emails", payload: {
    to, from: "MyCollectAI <reports@notify.mycollectai.com>", sender_domain: "notify.mycollectai.com",
    subject: `MyCollectAI weekly summary: ${t.replies ?? 0} replies, ${t.signups ?? 0} sign-ups${warnings.length ? " ⚠" : ""}`,
    html, text: lines.join("\n"), purpose: "transactional", label: "weekly-summary", unsubscribe_token: token,
    idempotency_key: body.force ? `${id}-${Date.now()}` : id, message_id: body.force ? `${id}-${Date.now()}` : id, queued_at: now.toISOString(),
  } });
  if (qErr) return J({ error: qErr.message }, { status: 500 });
  return J({ ok: true, to, warnings: warnings.length, replies: top.length });
});
