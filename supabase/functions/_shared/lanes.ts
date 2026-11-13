// Sending lanes. Every outgoing email picks one lane and is refused if it doesn't match.
//  cold         -> people who never opted in. Only from cold inboxes (Gmail via n8n, or Instantly), one-to-one plain text.
//  opted_in     -> app users with marketing_opt_in, lead-magnet / partner-form leads (consent_email). Only through SendGrid.
//  transactional-> receipts, sign-in, password and account notices. Only through the email queue. Never marketing.
export type Lane = "cold" | "opted_in" | "transactional";
export type Channel = "cold_inbox" | "sendgrid" | "email_queue";

export interface LaneRecipient {
  email?: string | null;
  consent_email?: boolean | null;
  marketing_opt_in?: boolean | null;
  purpose?: "marketing" | "transactional";
}

export const LANE_CHANNEL: Record<Lane, Channel> = { cold: "cold_inbox", opted_in: "sendgrid", transactional: "email_queue" };

export function pickLane(r: LaneRecipient): Lane {
  if (r.purpose === "transactional") return "transactional";
  if (r.consent_email || r.marketing_opt_in) return "opted_in";
  return "cold";
}

export class LaneError extends Error {}

/** Throws when a send would go out through the wrong channel for its recipient. */
export function assertLane(channel: Channel, r: LaneRecipient): Lane {
  const lane = pickLane(r);
  if (LANE_CHANNEL[lane] !== channel) {
    throw new LaneError(`Refused: ${r.email ?? "recipient"} is in the ${lane} lane and can't be sent through ${channel}`);
  }
  return lane;
}

export interface AudienceLead {
  email?: string | null;
  do_not_contact?: boolean | null;
  stage?: string | null;
  status?: string | null;
  reply_intent?: string | null;
  replied_at?: string | null;
  merged_into?: string | null;
  id?: string;
}

const DAY = 86_400_000;

/** Why a lead must never be in a broadcast audience, or null when they may be included. */
export function exclusionReason(l: AudienceLead, ctx: { suppressed: Set<string>; inSequence: Set<string>; now: number }): string | null {
  const email = String(l.email ?? "").trim().toLowerCase();
  if (!email) return "no_email";
  if (l.merged_into) return "merged";
  if (ctx.suppressed.has(email)) return "suppressed";
  if (l.do_not_contact || l.stage === "do_not_contact") return "do_not_contact";
  if (l.stage === "not_interested" || l.status === "not_interested" || l.reply_intent === "not_interested" || l.reply_intent === "remove_me") return "not_interested";
  if (l.replied_at && ctx.now - Date.parse(l.replied_at) < 30 * DAY) return "replied_recently";
  if (l.id && ctx.inSequence.has(l.id)) return "in_sequence";
  return null;
}

/** Inbox limit today: 5 on the warm-up start day, + increase each day after, capped by daily_limit. Mirrors sending_account_capacity(). */
export function inboxCapacity(a: { daily_limit: number; warmup_start_date?: string | null; warmup_daily_increase: number; active: boolean }, today: string): number {
  if (!a.active) return 0;
  if (!a.warmup_start_date) return a.daily_limit;
  const days = Math.round((Date.parse(today) - Date.parse(a.warmup_start_date)) / DAY);
  if (days < 0) return 0;
  return Math.min(a.daily_limit, 5 + days * a.warmup_daily_increase);
}

const TZ: Record<string, string> = {
  CA: "America/Los_Angeles", WA: "America/Los_Angeles", OR: "America/Los_Angeles", NV: "America/Los_Angeles",
  AZ: "America/Phoenix", CO: "America/Denver", UT: "America/Denver", NM: "America/Denver", MT: "America/Denver", WY: "America/Denver", ID: "America/Denver",
  TX: "America/Chicago", IL: "America/Chicago", MN: "America/Chicago", WI: "America/Chicago", MO: "America/Chicago", IA: "America/Chicago",
  LA: "America/Chicago", OK: "America/Chicago", KS: "America/Chicago", NE: "America/Chicago", AR: "America/Chicago", MS: "America/Chicago",
  AL: "America/Chicago", TN: "America/Chicago", SD: "America/Chicago", ND: "America/Chicago", AK: "America/Anchorage", HI: "Pacific/Honolulu",
};
/** Mirrors us_state_tz(); unknown states use New York time. */
export const stateTz = (state?: string | null) => TZ[String(state ?? "").trim().toUpperCase()] ?? "America/New_York";

function localParts(at: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return { weekday: p.weekday as string, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Cold quiet hours: only weekdays 8:30–17:00 in the recipient's time. Mirrors cold_send_window_open(). */
export function coldWindowOpen(at: Date, state?: string | null): boolean {
  const { weekday, minutes } = localParts(at, stateTz(state));
  if (weekday === "Sat" || weekday === "Sun") return false;
  return minutes >= 8 * 60 + 30 && minutes <= 17 * 60;
}

/** Next `count` weekdays (YYYY-MM-DD, New York calendar) starting with today if it is a weekday. */
export function nextWeekdays(from: Date, count: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12));
  while (out.length < count) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Spread n recipients across `days` weekdays, evenly but never more per day than `perDayCap` (when given).
 * Returns the day index (0-based) for each recipient; overflow continues onto later weekdays.
 */
export function spreadDays(n: number, days: number, perDayCap?: number): number[] {
  const d = Math.max(1, Math.floor(days));
  let perDay = Math.ceil(n / d);
  if (perDayCap && perDayCap > 0) perDay = Math.min(perDay, perDayCap);
  perDay = Math.max(1, perDay);
  return Array.from({ length: n }, (_, i) => Math.floor(i / perDay));
}

/** {{field|fallback}} merge fields. Missing or empty values use the fallback (or nothing). */
export function renderMerge(text: string, fields: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, k: string, fb?: string) => {
    const v = fields[k.toLowerCase()];
    return v && String(v).trim() ? String(v).trim() : (fb ?? "").trim();
  });
}

export const firstName = (name?: string | null) => (String(name ?? "").trim().split(/\s+/)[0] || "");

/** Footer every marketing email ends with. */
export const marketingFooter = (address: string, unsubscribeUrl: string) =>
  `\n\n--\nMyCollectAI · ${address.replace(/\s*\n\s*/g, ", ")} · Unsubscribe: ${unsubscribeUrl}`;

/** Cold emails: plain text, at most one link besides the unsubscribe link. */
export function coldBodyProblem(body: string, unsubscribeUrl?: string): string | null {
  if (/<[a-z][^>]*>/i.test(body)) return "Cold emails must be plain text (no HTML)";
  const links = (body.match(/https?:\/\/\S+/gi) ?? []).filter((u) => !unsubscribeUrl || !u.startsWith(unsubscribeUrl));
  if (links.length > 1) return "Cold emails can have at most one link";
  return null;
}

/** Grading webinar link used by {{webinar_link}} in sequence emails, tagged with the sequence ref. */
export const webinarLink = (base: string, ref: string) =>
  `${base.replace(/\/+$/, "")}/webinar/grading?ref=${encodeURIComponent(ref)}`;
