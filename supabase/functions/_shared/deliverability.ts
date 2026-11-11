// Deliverability rules shared by edge functions and the admin UI (src/lib/deliverability.ts re-exports).
// SQL mirror: deliverability_enforce_inbox() must use the same inbox thresholds.

/** Pause a cold inbox when its 7-day bounce rate is above 3% or any complaint arrives. */
export const INBOX_BOUNCE_PAUSE_RATE = 0.03;
/** Pause opted-in broadcasts when the 30-day spam complaint rate is above 0.1%. */
export const SPAM_PAUSE_RATE = 0.001;
export const HEALTH_WINDOW_DAYS = 7;
export const SPAM_WINDOW_DAYS = 30;
export const MAIN_DOMAIN = "mycollectai.com";

export function inboxPauseReason(s: { sends: number; bounces: number; complaints: number }): string | null {
  if (s.complaints > 0) return `Spam complaint received (${s.complaints} in ${HEALTH_WINDOW_DAYS} days)`;
  if (s.sends > 0 && s.bounces / s.sends > INBOX_BOUNCE_PAUSE_RATE) {
    return `Bounce rate ${(100 * s.bounces / s.sends).toFixed(1)}% is above ${INBOX_BOUNCE_PAUSE_RATE * 100}% (${s.bounces} of ${s.sends} in ${HEALTH_WINDOW_DAYS} days)`;
  }
  return null;
}

export function broadcastPauseReason(s: { delivered: number; spam: number }): string | null {
  if (s.spam <= 0) return null;
  const rate = s.spam / Math.max(s.delivered, 1);
  if (rate > SPAM_PAUSE_RATE) return `Spam complaint rate ${(rate * 100).toFixed(2)}% is above ${SPAM_PAUSE_RATE * 100}% (${s.spam} of ${s.delivered} in ${SPAM_WINDOW_DAYS} days)`;
  return null;
}

export function domainOf(email: string): string {
  return String(email ?? "").trim().toLowerCase().split("@")[1] ?? "";
}

/** Cold inboxes must live on separate domains, never mycollectai.com or a subdomain of it. */
export function coldDomainProblem(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!d) return "No domain";
  if (d === MAIN_DOMAIN || d.endsWith(`.${MAIN_DOMAIN}`)) return `Cold inboxes must not use ${MAIN_DOMAIN}. Move this inbox to a separate lookalike domain.`;
  return null;
}

export interface DnsCheck { spf: string | null; dmarc: string | null; dkimSelectors: string[]; mx: boolean }
export interface DnsAdvice { spf: "ok" | "missing" | "weak"; dkim: "ok" | "missing"; dmarc: "ok" | "missing" | "none_policy"; fixes: string[] }

export function adviseDns(c: DnsCheck): DnsAdvice {
  const fixes: string[] = [];
  let spf: DnsAdvice["spf"] = "ok";
  if (!c.spf) { spf = "missing"; fixes.push("Add an SPF record (a TXT record starting with v=spf1) that lists your email provider, e.g. include:_spf.google.com for Gmail."); }
  else if (/\+all\b/.test(c.spf)) { spf = "weak"; fixes.push("Your SPF record ends in +all, which lets anyone send as you. Change it to ~all or -all."); }
  const dkim: DnsAdvice["dkim"] = c.dkimSelectors.length ? "ok" : "missing";
  if (!c.dkimSelectors.length) fixes.push("No DKIM key found. Turn on DKIM signing in your email provider (Google Workspace: Admin → Gmail → Authenticate email) and add the TXT record it gives you.");
  let dmarc: DnsAdvice["dmarc"] = "ok";
  if (!c.dmarc) { dmarc = "missing"; fixes.push("Add a DMARC record: a TXT record at _dmarc with v=DMARC1; p=none; rua=mailto:you@yourdomain to start, then tighten to p=quarantine."); }
  else if (/p=none/i.test(c.dmarc)) { dmarc = "none_policy"; fixes.push("DMARC is set to p=none (monitor only). That is fine while warming up; move to p=quarantine once sending is steady."); }
  if (!c.mx) fixes.push("This domain has no MX record, so replies and bounce notices can't arrive. Add the MX records from your email provider.");
  return { spf, dkim, dmarc, fixes };
}

/** Week-over-week direction for an arrow. */
export function trend(cur: number, prev: number): { dir: "up" | "down" | "flat"; pct: number | null } {
  if (cur === prev) return { dir: "flat", pct: 0 };
  const dir = cur > prev ? "up" : "down";
  return { dir, pct: prev === 0 ? null : Math.round(((cur - prev) / prev) * 100) };
}

export function rate(n: number, d: number): number { return d > 0 ? n / d : 0; }

/** True during the 8:00 hour on a Monday in New York (cron fires at both possible UTC hours). */
export function isMondayEightET(d: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value; const h = Number(parts.find((p) => p.type === "hour")?.value);
  return wd === "Mon" && h === 8;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/** SendGrid events that put an address on the stop-list. */
export const SENDGRID_SUPPRESS: Record<string, string> = {
  bounce: "bounced", dropped: "bounced", spamreport: "complaint", unsubscribe: "unsubscribed", group_unsubscribe: "unsubscribed",
};
export function sendgridSuppressReason(e: { event?: string; reason?: string; type?: string }): string | null {
  const ev = String(e.event ?? "");
  if (ev === "dropped") return /bounce|invalid|unsubscribed|spam/i.test(String(e.reason ?? "")) ? "bounced" : null;
  if (ev === "bounce" && e.type === "blocked") return null; // temporary block, not a dead address
  return SENDGRID_SUPPRESS[ev] ?? null;
}
