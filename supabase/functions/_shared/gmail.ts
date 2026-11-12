// Gmail through the connector gateway. Each cold inbox row names the project secret holding its connection key.
const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const BATCH = "https://connector-gateway.lovable.dev/google_mail/batch/gmail/v1";

export function connKey(secretName?: string | null): string | null {
  if (!secretName || !/^GOOGLE_MAIL_API_KEY(_\d+)?$/.test(secretName)) return null;
  return Deno.env.get(secretName) ?? null;
}

export async function gmail(key: string, path: string, init: RequestInit = {}) {
  const lov = Deno.env.get("LOVABLE_API_KEY");
  if (!lov) throw new Error("LOVABLE_API_KEY missing");
  const r = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gmail [${r.status}]: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

// deno-lint-ignore no-explicit-any
type Any = any;
/** Fetch up to 50 messages in one batch request; returns parsed message objects (failed parts are skipped and logged). */
export async function batchGet(key: string, ids: string[], format = "full"): Promise<Any[]> {
  if (!ids.length) return [];
  const boundary = `b${crypto.randomUUID().replace(/-/g, "")}`;
  const body = ids.slice(0, 50).map((id) => `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=${format}\r\n\r\n`).join("") + `--${boundary}--`;
  const r = await fetch(BATCH, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "X-Connection-Api-Key": key, "Content-Type": `multipart/mixed; boundary=${boundary}` },
    body,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gmail batch [${r.status}]: ${text.slice(0, 500)}`);
  const rb = (r.headers.get("content-type") ?? "").match(/boundary="?([^";]+)"?/)?.[1];
  if (!rb) throw new Error("Gmail batch: no response boundary");
  const out: Any[] = [];
  for (const part of text.split(`--${rb}`)) {
    const st = part.match(/HTTP\/1\.1 (\d{3})/);
    if (!st) continue;
    const j = part.indexOf("{");
    if (st[1] !== "200") { console.error("batch part failed", st[1], part.slice(j, j + 200)); continue; }
    try { out.push(JSON.parse(part.slice(j, part.lastIndexOf("}") + 1))); } catch (e) { console.error("batch parse", e); }
  }
  return out;
}

export function headerMap(msg: Any): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of msg?.payload?.headers ?? []) m[String(h.name).toLowerCase()] = String(h.value ?? "");
  return m;
}

/** All text/* parts decoded and joined (bounce reports keep the DSN in a text part). */
export function bodyText(msg: Any): string {
  const parts: string[] = [];
  const walk = (p: Any) => {
    if (!p) return;
    if (p.body?.data && /^(text\/|message\/delivery-status)/.test(p.mimeType ?? "")) {
      const s = atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      parts.push(new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0))));
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(msg?.payload);
  return parts.join("\n").slice(0, 20000);
}

export async function ensureLabel(key: string, name: string): Promise<string> {
  const { labels = [] } = await gmail(key, "/users/me/labels");
  const hit = labels.find((l: Any) => l.name === name);
  if (hit) return hit.id;
  return (await gmail(key, "/users/me/labels", { method: "POST", body: JSON.stringify({ name, labelListVisibility: "labelHide", messageListVisibility: "show" }) })).id;
}
