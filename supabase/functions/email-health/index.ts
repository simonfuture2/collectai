// Admin-only: look up SPF, DKIM, DMARC and MX for mycollectai.com and every sending_accounts domain.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adviseDns, coldDomainProblem, MAIN_DOMAIN } from "../_shared/deliverability.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
// Common DKIM selectors: Google Workspace, SendGrid, Microsoft, Zoho, generic.
const SELECTORS = ["google", "s1", "s2", "selector1", "selector2", "default", "k1", "zoho", "mail", "dkim", "smtp", "em"];

async function lookup(name: string, type: "TXT" | "MX" | "CNAME"): Promise<string[]> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.Answer ?? []).filter((a: { type: number }) => a.type === ({ TXT: 16, MX: 15, CNAME: 5 })[type]).map((a: { data: string }) => String(a.data).replace(/^"|"$/g, "").replace(/" "/g, ""));
  } catch { return []; }
}

async function checkDomain(domain: string) {
  const [txt, dmarcTxt, mx, ...dkim] = await Promise.all([
    lookup(domain, "TXT"), lookup(`_dmarc.${domain}`, "TXT"), lookup(domain, "MX"),
    ...SELECTORS.map(async (s) => {
      const [t, c] = await Promise.all([lookup(`${s}._domainkey.${domain}`, "TXT"), lookup(`${s}._domainkey.${domain}`, "CNAME")]);
      return t.some((x) => /p=/.test(x)) || c.length ? s : null;
    }),
  ]);
  const check = { spf: txt.find((t) => /^v=spf1/i.test(t)) ?? null, dmarc: dmarcTxt.find((t) => /^v=DMARC1/i.test(t)) ?? null, dkimSelectors: dkim.filter(Boolean) as string[], mx: mx.length > 0 };
  return { domain, ...check, advice: adviseDns(check) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") ?? "";
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: ok } = await user.rpc("is_agent_admin");
  if (!ok) return json({ error: "not allowed" }, 403);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: accts } = await db.from("sending_accounts").select("id, email, domain, provider, active");
  const byDomain = new Map<string, { email: string; provider: string; active: boolean }[]>();
  byDomain.set(MAIN_DOMAIN, []);
  for (const a of accts ?? []) {
    const d = String(a.domain || a.email.split("@")[1] || "").toLowerCase();
    if (!d) continue;
    byDomain.set(d, [...(byDomain.get(d) ?? []), { email: a.email, provider: a.provider, active: a.active }]);
  }
  const domains = await Promise.all([...byDomain.entries()].map(async ([d, inboxes]) => {
    const r = await checkDomain(d);
    const coldProblem = inboxes.some((i) => i.provider !== "sendgrid") ? coldDomainProblem(d) : null;
    return { ...r, role: d === MAIN_DOMAIN ? "main" : "cold", inboxes, coldProblem };
  }));
  return json({ domains, checked_at: new Date().toISOString() });
});
