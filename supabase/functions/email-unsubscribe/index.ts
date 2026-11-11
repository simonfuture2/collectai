import { createClient } from "npm:@supabase/supabase-js@2";

const page = (title: string, msg: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#222"><h1 style="font-size:22px">${title}</h1><p>${msg}</p><p><a href="https://mycollectai.com">mycollectai.com</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";
  if (!token && req.method === "POST") {
    try { token = new URLSearchParams(await req.text()).get("token") || ""; } catch { /* ignore */ }
  }
  if (!/^[a-f0-9-]{20,80}$/i.test(token)) return page("Link not valid", "This unsubscribe link isn't valid.", 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row } = await supabase.from("email_unsubscribe_tokens").select("id,email,used_at").eq("token", token).maybeSingle();
  if (!row?.email) return page("Link not valid", "This unsubscribe link isn't valid.", 404);

  const email = row.email.toLowerCase();
  if (!row.used_at) {
    await supabase.from("email_unsubscribe_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  }
  const { data: existing } = await supabase.from("suppressed_emails").select("id").ilike("email", email).maybeSingle();
  if (!existing) await supabase.from("suppressed_emails").insert({ email, reason: "unsubscribe", metadata: { source: "campaign" } });
  await supabase.from("agent_leads").update({ do_not_contact: true, status: "do_not_contact" }).ilike("email", email);

  return page("You're unsubscribed", "You won't get any more of these emails from MyCollectAI.");
});
