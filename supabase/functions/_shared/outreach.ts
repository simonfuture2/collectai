// Shared outreach rules: signed unsubscribe links and the suppression check.
// Every marketing/outreach sender must call filterSuppressed / isSuppressed before sending.
// Transactional account emails (receipts, sign-in, password) do NOT use this.

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(p + "===".slice((p.length + 3) % 4));
};

async function hmac(data: string): Promise<string> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET missing");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function unsubscribeToken(email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  const payload = b64url(enc.encode(e));
  return `${payload}.${await hmac(e)}`;
}

export async function verifyUnsubscribeToken(token: string): Promise<string | null> {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  let email: string;
  try { email = fromB64url(payload); } catch { return null; }
  const expected = await hmac(email);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? email : null;
}

export async function unsubscribeUrl(email: string): Promise<string> {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/unsubscribe?t=${encodeURIComponent(await unsubscribeToken(email))}`;
}

// deno-lint-ignore no-explicit-any
export async function suppressedSet(supabase: any): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await supabase.from("email_suppressions").select("email");
  for (const r of data || []) out.add(String(r.email).toLowerCase());
  const { data: old } = await supabase.from("suppressed_emails").select("email");
  for (const r of old || []) out.add(String(r.email).toLowerCase());
  return out;
}

// deno-lint-ignore no-explicit-any
export async function isSuppressed(supabase: any, email: string): Promise<boolean> {
  const s = await suppressedSet(supabase);
  return s.has(email.trim().toLowerCase());
}

/** Opted-in lane only: plain-text marketing email through SendGrid with its unsubscribe group and one-click headers. */
export async function sendgridMarketing(to: string, subject: string, text: string, unsubUrl: string, opts: { test?: boolean } = {}) {
  const apiKey = Deno.env.get("SENDGRID_API_KEY")?.trim();
  const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL")?.trim();
  const group = Number(Deno.env.get("SENDGRID_UNSUB_GROUP_ID") ?? "");
  if (!apiKey || !fromEmail) throw new Error("SendGrid isn't set up");
  if (!opts.test && !(group > 0)) throw new Error("SENDGRID_UNSUB_GROUP_ID is missing, so opted-in sends are paused");
  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: "Simon at MyCollectAI" },
    subject,
    content: [{ type: "text/plain", value: text }],
    headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    ...(group > 0 ? { asm: { group_id: group } } : {}),
    tracking_settings: { click_tracking: { enable: false } },
  };
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`SendGrid ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
