// Sequence rules shared by the sequence-tick function and the admin screens (src/lib/sequenceRules.ts re-exports this file).
// Pure functions only, so they can be tested without a database.
import { coldWindowOpen } from "./lanes.ts";

export type SeqLane = "cold" | "opted_in";
export type EnrollmentStatus = "active" | "paused" | "stopped_reply" | "stopped_unsub" | "stopped_signup" | "completed";

export const DAY_MS = 86_400_000;
export const MIN_GAP_UNITS = 2;           // at least 2 "days" between emails to the same person
export const AUTO_APPROVE_AFTER = 20;     // unedited approvals before steps 2+ can auto-approve
export const BULK_ENROLL_MAX = 500;
export const STOP_STAGES: Record<string, EnrollmentStatus> = {
  meeting_booked: "stopped_reply", not_interested: "stopped_reply", do_not_contact: "stopped_unsub", signed_up: "stopped_signup",
};

/** Length of one sequence day; test enrollments use minutes. */
export const unitMs = (clockMinutes?: number | null) => (clockMinutes && clockMinutes > 0 ? clockMinutes * 60_000 : DAY_MS);

export const isAutoReply = (intent?: string | null) => intent === "auto_reply";

/** What a reply does to a sequence: auto-replies do nothing, opt-outs unsubscribe, anything else stops on reply. */
export function stopForReply(intent?: string | null): EnrollmentStatus | null {
  if (isAutoReply(intent)) return null;
  return intent === "remove_me" || intent === "unsubscribe" ? "stopped_unsub" : "stopped_reply";
}

export interface SeqLead {
  email?: string | null; stage?: string | null; do_not_contact?: boolean | null; unsubscribed_at?: string | null;
  consent_email?: boolean | null; merged_into?: string | null; user_id?: string | null;
}

/** Why an enrollment must stop now (or null to carry on). */
export function stopReason(lead: SeqLead, ctx: { suppressed: Set<string>; lane: SeqLane; marketingOptIn?: boolean | null; isUserEnrollment?: boolean }):
  { status: EnrollmentStatus; reason: string } | null {
  const email = String(lead.email ?? "").trim().toLowerCase();
  if (!email) return { status: "stopped_unsub", reason: "no email" };
  if (ctx.suppressed.has(email)) return { status: "stopped_unsub", reason: "suppressed" };
  if (lead.do_not_contact || lead.unsubscribed_at) return { status: "stopped_unsub", reason: "do not contact" };
  if (ctx.isUserEnrollment) {
    if (!ctx.marketingOptIn) return { status: "stopped_unsub", reason: "marketing emails off" };
    return null;
  }
  const s = lead.stage ? STOP_STAGES[lead.stage] : undefined;
  if (s) return { status: s, reason: `stage: ${lead.stage}` };
  if (ctx.lane === "opted_in" && !lead.consent_email) return { status: "stopped_unsub", reason: "no email consent" };
  return null;
}

/** Earliest time the next email may go out given the 2-day gap. */
export function gapReadyAt(lastEmailAt: string | null | undefined, clockMinutes?: number | null): number {
  return lastEmailAt ? Date.parse(lastEmailAt) + MIN_GAP_UNITS * unitMs(clockMinutes) : 0;
}

/** Cold: next moment inside weekdays 8:30-17:00 recipient time (15-minute steps). Opted-in: any time. */
export function nextSendSlot(at: Date, lane: SeqLane, state?: string | null): Date {
  if (lane !== "cold") return at;
  const t = new Date(at);
  for (let i = 0; i < 4 * 24 * 4 && !coldWindowOpen(t, state); i++) t.setTime(t.getTime() + 15 * 60_000);
  return t;
}

/** Links in a body, ignoring the unsubscribe link. */
export function countLinks(body: string, unsubscribeUrl?: string): number {
  return (body.match(/https?:\/\/\S+/gi) ?? []).filter((u) => !unsubscribeUrl || !u.startsWith(unsubscribeUrl)).length;
}

/** Cold step 1: no links or images. Any later step: at most one link. */
export function linkProblem(body: string, opts: { lane: SeqLane; isFirstStep: boolean; unsubscribeUrl?: string }): string | null {
  const links = countLinks(body, opts.unsubscribeUrl);
  const image = /<img\b|\.(png|jpe?g|gif|webp)(\?|\s|$)/i.test(body);
  if (opts.lane === "cold" && opts.isFirstStep && (links > 0 || image)) return "First cold email must have no links or images";
  if (links > 1) return "At most one link per email";
  return null;
}

export function canAutoApprove(o: { stepNo: number; firstStepNo: number; requireApproval: boolean; autoApprove: boolean; approvedUnedited: number }): boolean {
  if (!o.requireApproval) return true;
  return o.autoApprove && o.approvedUnedited >= AUTO_APPROVE_AFTER && o.stepNo > o.firstStepNo;
}

export type Decision = { kind: "stop"; status: EnrollmentStatus; reason: string } | { kind: "wait"; until: Date; reason: string } | { kind: "go" };

/** One due enrollment: stop it, push it later, or go ahead with the current step. */
export function decide(input: {
  now: Date; lane: SeqLane; channel: "email" | "call_task" | "dm_task"; lead: SeqLead; state?: string | null;
  suppressed: Set<string>; lastEmailAt?: string | null; clockMinutes?: number | null; capacityLeft: number;
  marketingOptIn?: boolean | null; isUserEnrollment?: boolean;
}): Decision {
  const stop = stopReason(input.lead, { suppressed: input.suppressed, lane: input.lane, marketingOptIn: input.marketingOptIn, isUserEnrollment: input.isUserEnrollment });
  if (stop) return { kind: "stop", ...stop };
  if (input.channel !== "email") return { kind: "go" };
  const gap = gapReadyAt(input.lastEmailAt, input.clockMinutes);
  if (gap > input.now.getTime()) return { kind: "wait", until: new Date(gap), reason: "2-day gap" };
  const slot = nextSendSlot(input.now, input.lane, input.state);
  if (slot.getTime() > input.now.getTime()) return { kind: "wait", until: slot, reason: "outside sending hours" };
  if (input.capacityLeft <= 0) return { kind: "wait", until: new Date(input.now.getTime() + 60 * 60_000), reason: "lane capacity used up" };
  return { kind: "go" };
}

/** Why a lead can't join a sequence (null = OK). */
export function enrollSkipReason(lead: SeqLead & { id: string }, ctx: { suppressed: Set<string>; active: Set<string>; lane: SeqLane }): string | null {
  const email = String(lead.email ?? "").trim().toLowerCase();
  if (!email) return "no email";
  if (lead.merged_into) return "merged";
  if (ctx.suppressed.has(email)) return "unsubscribed";
  if (lead.do_not_contact || lead.unsubscribed_at || lead.stage === "do_not_contact") return "do not contact";
  if (lead.stage && STOP_STAGES[lead.stage]) return lead.stage.replace(/_/g, " ");
  if (ctx.active.has(lead.id)) return "already in a sequence";
  if (ctx.lane === "cold" && lead.consent_email) return "opted in (use an opted-in sequence)";
  if (ctx.lane === "opted_in" && !lead.consent_email) return "no email consent";
  return null;
}

/** Start times for n enrollments, perDay a day; cold starts skip weekends (New York calendar, 9:00). */
export function spreadStarts(n: number, perDay: number, from: Date, lane: SeqLane): Date[] {
  const per = Math.max(1, Math.floor(perDay));
  const days: Date[] = [];
  const d = new Date(from);
  const need = Math.ceil(n / per);
  let first = true;
  while (days.length < need) {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
    if (lane !== "cold" || (wd !== "Sat" && wd !== "Sun")) days.push(first ? new Date(from) : new Date(d));
    first = false;
    d.setTime(d.getTime() + DAY_MS);
  }
  return Array.from({ length: n }, (_, i) => days[Math.floor(i / per)]);
}

/** Reply rate per step: replies attributed to the step the enrollment was on when it stopped for a reply. */
export function replyRates(enrollments: { status: string; current_step: number }[], sentByStep: Record<number, number>): Record<number, number> {
  const replies: Record<number, number> = {};
  for (const e of enrollments) if (e.status === "stopped_reply") replies[e.current_step] = (replies[e.current_step] ?? 0) + 1;
  const out: Record<number, number> = {};
  for (const [k, sent] of Object.entries(sentByStep)) out[Number(k)] = sent ? (replies[Number(k)] ?? 0) / sent : 0;
  return out;
}
