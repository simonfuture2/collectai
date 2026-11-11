import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, linkProblem, canAutoApprove, stopForReply, stopReason, enrollSkipReason, spreadStarts, gapReadyAt, nextSendSlot, BULK_ENROLL_MAX } from "./sequenceRules.ts";

const wedNoonNY = new Date("2026-11-11T17:00:00Z");
const satNoonNY = new Date("2026-11-14T17:00:00Z");
const lead = { email: "a@shop.com", stage: "in_sequence" };
const base = { now: wedNoonNY, lane: "cold" as const, channel: "email" as const, lead, suppressed: new Set<string>(), capacityLeft: 5 };

test("cold sends wait over the weekend", () => {
  const d = decide({ ...base, now: satNoonNY });
  assert.equal(d.kind, "wait");
  if (d.kind === "wait") assert.equal(d.until.toISOString(), "2026-11-16T13:30:00.000Z"); // Monday 8:30 New York
});
test("cold sends wait outside 8:30-17:00 recipient time", () => {
  assert.equal(decide({ ...base, now: new Date("2026-11-11T12:00:00Z") }).kind, "wait"); // 7:00 NY
  assert.equal(decide({ ...base, now: new Date("2026-11-11T23:30:00Z"), state: "NY" }).kind, "wait"); // 18:30 NY
});
test("California lead at 9:00 local is inside the window", () => assert.equal(nextSendSlot(new Date("2026-11-11T17:00:00Z"), "cold", "CA").toISOString(), "2026-11-11T17:00:00.000Z"));
test("opted-in sends are not held by quiet hours", () => assert.equal(decide({ ...base, lane: "opted_in", lead: { ...lead, consent_email: true }, now: satNoonNY }).kind, "go"));
test("weekday in-hours cold send goes", () => assert.equal(decide(base).kind, "go"));

test("any real reply stops; auto-replies don't", () => {
  assert.equal(stopForReply("interested"), "stopped_reply");
  assert.equal(stopForReply("question"), "stopped_reply");
  assert.equal(stopForReply("auto_reply"), null);
  assert.equal(stopForReply("remove_me"), "stopped_unsub");
});
for (const [stage, status] of [["meeting_booked", "stopped_reply"], ["not_interested", "stopped_reply"], ["do_not_contact", "stopped_unsub"], ["signed_up", "stopped_signup"]]) {
  test(`stage ${stage} stops the sequence`, () => assert.equal(stopReason({ email: "a@b.com", stage }, { suppressed: new Set(), lane: "cold" })?.status, status));
}
test("suppressed address stops, any case", () => assert.equal(decide({ ...base, lead: { email: "A@Shop.com" }, suppressed: new Set(["a@shop.com"]) }).kind, "stop"));
test("unsubscribed lead stops", () => assert.equal(stopReason({ email: "a@b.com", unsubscribed_at: "2026-11-01" }, { suppressed: new Set(), lane: "cold" })?.status, "stopped_unsub"));
test("new-user enrollment stops when marketing emails are turned off", () => assert.equal(stopReason({ email: "u@x.com" }, { suppressed: new Set(), lane: "opted_in", isUserEnrollment: true, marketingOptIn: false })?.status, "stopped_unsub"));

test("at least 2 days between emails", () => {
  const d = decide({ ...base, lastEmailAt: "2026-11-10T17:00:00Z" });
  assert.equal(d.kind, "wait");
  assert.equal(decide({ ...base, lastEmailAt: "2026-11-09T17:00:00Z" }).kind, "go");
});
test("fast clock: 2-minute gap with 1-minute days", () => assert.equal(gapReadyAt("2026-11-11T17:00:00Z", 1), Date.parse("2026-11-11T17:02:00Z")));
test("lane capacity used up waits", () => assert.equal(decide({ ...base, capacityLeft: 0 }).kind, "wait"));
test("call tasks are not held by email limits", () => assert.equal(decide({ ...base, channel: "call_task", capacityLeft: 0, now: satNoonNY }).kind, "go"));

test("cold step 1 has no links or images", () => {
  assert.match(linkProblem("see https://x.com", { lane: "cold", isFirstStep: true }) ?? "", /no links/);
  assert.match(linkProblem("pic.png here", { lane: "cold", isFirstStep: true }) ?? "", /no links/);
  assert.equal(linkProblem("Hi, want me to send it?", { lane: "cold", isFirstStep: true }), null);
});
test("later steps allow one link, not two; unsubscribe link doesn't count", () => {
  assert.equal(linkProblem("https://a.com", { lane: "cold", isFirstStep: false }), null);
  assert.ok(linkProblem("https://a.com https://b.com", { lane: "cold", isFirstStep: false }));
  assert.equal(linkProblem("Hi\n\nUnsubscribe: https://u.x/unsub?t=1", { lane: "cold", isFirstStep: true, unsubscribeUrl: "https://u.x/unsub" }), null);
});

test("auto-approve only for steps 2+ after 20 unedited approvals", () => {
  const o = { stepNo: 2, firstStepNo: 1, requireApproval: true, autoApprove: true, approvedUnedited: 20 };
  assert.equal(canAutoApprove(o), true);
  assert.equal(canAutoApprove({ ...o, approvedUnedited: 19 }), false);
  assert.equal(canAutoApprove({ ...o, stepNo: 1 }), false);
  assert.equal(canAutoApprove({ ...o, autoApprove: false }), false);
});

test("bulk enroll skips with reasons", () => {
  const ctx = { suppressed: new Set(["gone@x.com"]), active: new Set(["l2"]), lane: "cold" as const };
  assert.equal(enrollSkipReason({ id: "l1", email: "gone@x.com" }, ctx), "unsubscribed");
  assert.equal(enrollSkipReason({ id: "l2", email: "a@x.com" }, ctx), "already in a sequence");
  assert.equal(enrollSkipReason({ id: "l3", email: "b@x.com", consent_email: true }, ctx), "opted in (use an opted-in sequence)");
  assert.equal(enrollSkipReason({ id: "l4", email: "c@x.com", stage: "not_interested" }, ctx), "not interested");
  assert.equal(enrollSkipReason({ id: "l5", email: "d@x.com" }, ctx), null);
  assert.equal(BULK_ENROLL_MAX, 500);
});
test("bulk starts spread by capacity and skip weekends for cold", () => {
  const fri = new Date("2026-11-13T14:00:00Z");
  const s = spreadStarts(5, 2, fri, "cold");
  assert.deepEqual(s.map((d) => d.toISOString().slice(0, 10)), ["2026-11-13", "2026-11-13", "2026-11-16", "2026-11-16", "2026-11-17"]);
});
