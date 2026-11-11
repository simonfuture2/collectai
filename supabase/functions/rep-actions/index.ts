// Rep actions that need email drafting: book_meeting.
// Sets stage meeting_booked (stop triggers end the sequence), logs it, and drafts a confirmation plus a
// day-before reminder for approval. Drafts follow the lead's lane (cold inbox or SendGrid) and use the rep's name and reply-to.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { firstName, marketingFooter, pickLane, stateTz } from "../_shared/lanes.ts";
import { isSuppressed, unsubscribeUrl } from "../_shared/outreach.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({
  action: z.literal("book_meeting"),
  lead_id: z.string().uuid(),
  meeting_at: z.string().datetime({ offset: true }).optional(),
  confirmation: z.string().max(3000).optional(),
  note: z.string().max(1000).optional(),
}).refine((b) => b.meeting_at || b.confirmation, { message: "Pick a time or paste the booking confirmation" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first" }, 401);
  const { data: u } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth.slice(7));
  const uid = u?.user?.id;
  if (!uid) return json({ error: "Sign in first" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const b = parsed.data;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [{ data: lead }, { data: rep }, { data: isAdm }, { data: ag }] = await Promise.all([
    db.from("agent_leads").select("*").eq("id", b.lead_id).maybeSingle(),
    db.from("sales_reps").select("*").eq("user_id", uid).eq("active", true).maybeSingle(),
    db.rpc("is_admin", { _user_id: uid }),
    db.from("agent_admins").select("user_id").eq("user_id", uid).maybeSingle(),
  ]);
  const admin = isAdm === true || !!ag;
  if (!lead) return json({ error: "Lead not found" }, 404);
  if (!admin && !(rep && lead.owner_id === uid)) return json({ error: "Not your lead" }, 403);

  const meeting = b.meeting_at ? new Date(b.meeting_at) : null;
  const tz = stateTz(lead.state);
  const when = meeting ? new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(meeting) : null;

  const { error: se } = await db.from("agent_leads").update({ stage: "meeting_booked", next_action: "Meeting", next_action_at: meeting?.toISOString() ?? null }).eq("id", lead.id);
  if (se) return json({ error: se.message }, 500);
  await db.from("agent_activities").insert({ lead_id: lead.id, rep_id: uid, type: "meeting_booked", body: [when ? `Meeting ${when}` : "Meeting booked", b.note].filter(Boolean).join(" — "),
    meta: { meeting_at: meeting?.toISOString() ?? null, confirmation: b.confirmation?.slice(0, 3000) ?? null } });

  // Drafts (for approval). Skip anyone who can't be emailed.
  const email = String(lead.email ?? "").trim().toLowerCase();
  if (!email || lead.do_not_contact || lead.unsubscribed_at || (await isSuppressed(db, email))) return json({ ok: true, drafts: 0, note: "No emails drafted: no address or they can't be emailed" });

  let repName = rep?.display_name ?? "Simon", repEmail: string | null = rep?.email ?? null;
  if (!repEmail) repEmail = (await db.auth.admin.getUserById(uid)).data?.user?.email ?? null;
  const sig = rep?.email_signature?.trim() || repName;
  const lane = pickLane({ email, consent_email: !!lead.consent_email });
  const { data: eo } = await db.from("agent_settings").select("config").eq("key", "email_outreach").maybeSingle();
  const address = String(eo?.config?.physical_address ?? "306 W Redwood Street, Baltimore, MD 21201");
  const unsub = await unsubscribeUrl(email);
  const footer = lane === "cold" ? marketingFooter(address, unsub) : "";
  const hi = firstName(lead.name) ? `Hi ${firstName(lead.name)},` : "Hi,";
  const at = when ? ` for ${when}` : "";
  const confirm = `${hi}\n\nThanks for making time. You're booked${at}. I'll keep it to 15 minutes and show you how MyCollectAI prices cards from a photo.\n\nIs there anything you'd like me to cover?\n\n${sig}${footer}`;
  const remind = `${hi}\n\nQuick reminder about our call tomorrow${when ? ` (${when})` : ""}. Still a good time for you?\n\n${sig}${footer}`;
  const workflow = lane === "cold" ? "email_outreach" : "sequence_optin";
  const base = { lead_id: lead.id, workflow, channel: "email", status: "pending", ref_code: rep?.ref_code ?? "rep_meeting", reply_to: repEmail, from_name: repName };
  const rows: Record<string, unknown>[] = [{ ...base, subject: "Our call" + (when ? ` — ${when}` : ""), draft_text: confirm, final_text: confirm }];
  const rem = meeting ? new Date(meeting.getTime() - 86_400_000) : null;
  if (rem && rem.getTime() > Date.now()) rows.push({ ...base, subject: "Tomorrow's call", draft_text: remind, final_text: remind, scheduled_for: rem.toISOString() });
  const { error: ie } = await db.from("agent_outreach").insert(rows);
  if (ie) return json({ error: ie.message }, 500);
  return json({ ok: true, drafts: rows.length, lane });
});
