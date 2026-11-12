// Pure Gmail helpers (no network): building a plain-text message and reading bounce / auto-reply notices.
const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
export const mimeHeader = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

/** Splits "Name <a@b.com>" into its parts. */
export function splitAddress(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: "", email: v.trim().toLowerCase() };
}

export function buildRawEmail(o: { from: string; to: string; subject: string; body: string; replyTo?: string | null; unsubscribeUrl?: string | null }): string {
  const f = splitAddress(clean(o.from));
  const lines = [
    `From: ${f.name ? `${mimeHeader(f.name)} <${f.email}>` : f.email}`,
    `To: ${clean(o.to)}`,
    `Subject: ${mimeHeader(clean(o.subject))}`,
    ...(o.replyTo ? [`Reply-To: ${clean(o.replyTo)}`] : []),
    ...(o.unsubscribeUrl ? [`List-Unsubscribe: <${clean(o.unsubscribeUrl)}>`, "List-Unsubscribe-Post: List-Unsubscribe=One-Click"] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(o.body.replace(/\r?\n/g, "\r\n")).replace(/.{76}/g, "$&\r\n"),
  ];
  return b64(lines.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type Headers = Record<string, string>;
const h = (hs: Headers, k: string) => hs[k.toLowerCase()] ?? "";

/** True when the message is a delivery-failure or complaint notice. */
export function isBounceNotice(hs: Headers): boolean {
  const from = h(hs, "from").toLowerCase(), subj = h(hs, "subject").toLowerCase();
  return /mailer-daemon|postmaster|mail delivery (sub)?system/.test(from) ||
    /delivery status notification \(failure\)|undeliverable|undelivered mail|delivery has failed|address not found|returned mail|message not delivered/.test(subj) ||
    /multipart\/report/.test(h(hs, "content-type").toLowerCase());
}

/** Out-of-office and other machine replies; these must not stop a sequence. */
export function isAutoReply(hs: Headers): boolean {
  const auto = h(hs, "auto-submitted").toLowerCase();
  if (auto && auto !== "no") return true;
  if (h(hs, "x-autoreply") || h(hs, "x-autorespond") || /auto_reply|bulk|junk|list/i.test(h(hs, "precedence"))) return true;
  return /out of (the )?office|automatic reply|auto(matic)?[- ]?reply|autoreply|away from (my|the) (desk|office)|on vacation/i.test(h(hs, "subject"));
}

/** Finds the address that failed in a bounce notice. Never guesses: returns null when no address is stated. */
export function failedRecipient(hs: Headers, body: string, ownAddress?: string): string | null {
  const own = (ownAddress ?? "").toLowerCase();
  const ok = (e?: string | null) => { const v = (e ?? "").trim().toLowerCase().replace(/[<>.;,]+$/, "").replace(/^</, ""); return v && v !== own && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null; };
  const x = ok(h(hs, "x-failed-recipients").split(",")[0]);
  if (x) return x;
  for (const re of [/Final-Recipient:\s*rfc822;\s*<?([^\s>]+)/i, /Original-Recipient:\s*rfc822;\s*<?([^\s>]+)/i,
    /wasn't delivered to\s+<?([^\s>]+@[^\s>]+)/i, /could not be delivered to:?\s*<?([^\s>]+@[^\s>]+)/i,
    /delivery to the following recipients? failed[^\n]*\n\s*<?([^\s>]+@[^\s>]+)/i, /<([^\s>]+@[^\s>]+)>[:\s]+(?:host|recipient address rejected|user unknown|mailbox)/i]) {
    const v = ok(body.match(re)?.[1]);
    if (v) return v;
  }
  return null;
}

/** "complaint" for spam reports (feedback loop), otherwise "bounce". */
export const bounceKind = (hs: Headers, body: string) => (/feedback-type:\s*abuse|abuse report|spam complaint/i.test(`${h(hs, "content-type")}\n${body}`) ? "complaint" : "bounce");
