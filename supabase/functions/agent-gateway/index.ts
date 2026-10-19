// Supabase / Lovable Cloud Edge Function: agent-gateway
// The single door n8n uses to reach the agent tables. Lovable Cloud doesn't give out the
// service-role key, so this function (which runs inside your project and already has it)
// does the database work on n8n's behalf.
//
// Security: every request must send header  x-agent-key: <AGENT_GATEWAY_SECRET>
// Only the actions listed in ALLOWED can run. JWT verification must be OFF for this function.
//
// POST { "action": "agent_claim_ig_comment", "args": { ...named params... } }
// POST { "action": "get_settings", "args": { "key": "community_drafts" } }
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SECRET = Deno.env.get("AGENT_GATEWAY_SECRET") ?? "";

// action -> allowed argument names
const ALLOWED: Record<string, string[]> = {
  agent_claim_ig_comment: ["p_comment_id", "p_ig_user_id", "p_username", "p_media_id", "p_text"],
  agent_mark_outreach: ["p_id", "p_status", "p_error"],
  agent_queue_community_post: ["p_url", "p_author", "p_title", "p_body", "p_channel"],
  agent_attach_draft: ["p_id", "p_draft", "p_subject"],
  agent_next_posts_to_draft: ["p_limit"],
  agent_match_reply: ["p_from_email", "p_message_id"],
  agent_record_reply: ["p_lead_id", "p_message_id", "p_from_email", "p_subject", "p_body", "p_intent", "p_summary"],
  agent_next_leads_to_draft: ["p_limit"],
  agent_queue_email: ["p_lead_id", "p_subject", "p_body"],
  agent_claim_approved_emails: [],
  get_settings: ["key"],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (SECRET.length < 24) return json({ error: "AGENT_GATEWAY_SECRET is not set (min 24 chars)" }, 500);
  if (!sameSecret(req.headers.get("x-agent-key") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);

  let body: { action?: string; args?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const action = body.action ?? "";
  const allowed = ALLOWED[action];
  if (!allowed) return json({ error: `unknown action: ${action}` }, 400);

  const args: Record<string, unknown> = {};
  for (const k of allowed) if (body.args && k in body.args) args[k] = body.args[k];

  if (action === "get_settings") {
    const { data, error } = await db.from("agent_settings").select("*").eq("key", String(args.key ?? ""));
    if (error) return json({ error: error.message }, 500);
    return json(data ?? []);
  }

  const { data, error } = await db.rpc(action, args);
  if (error) return json({ error: error.message, code: error.code }, 500);
  return json(data ?? {});
});
