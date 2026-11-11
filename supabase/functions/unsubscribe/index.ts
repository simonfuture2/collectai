// Public one-click unsubscribe for marketing/outreach emails (signed token, no login).
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyUnsubscribeToken } from "../_shared/outreach.ts";

const page = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;text-align:center;color:#1f2937}h1{font-size:22px}a{color:#b8860b}</style></head>
<body><h1>${title}</h1><p>${body}</p><p><a href="https://mycollectai.com">MyCollectAI</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let token = url.searchParams.get("t") || "";
  if (!token && req.method === "POST") {
    try { const f = await req.formData(); token = String(f.get("t") || ""); } catch { /* one-click body is optional */ }
  }
  const email = token ? await verifyUnsubscribeToken(token) : null;
  if (!email) return page("Link not valid", "This unsubscribe link is invalid or incomplete.", 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.rpc("suppress_email", { _email: email, _reason: "unsubscribed", _source: req.method === "POST" ? "one_click" : "link" });
  if (error) {
    console.error("unsubscribe failed", error);
    return page("Something went wrong", "Please try the link again in a minute.", 500);
  }
  if (req.method === "POST") return new Response("ok", { status: 200 });
  return page("You're unsubscribed from MyCollectAI emails", "You won't get any more outreach or update emails from us. Account emails like receipts and sign-in links will still arrive.");
});
