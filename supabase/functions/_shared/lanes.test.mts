import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLane, pickLane, exclusionReason, inboxCapacity, coldWindowOpen, spreadDays, renderMerge, coldBodyProblem, nextWeekdays } from "./lanes.ts";

const now = Date.parse("2026-11-11T17:00:00Z");
const ctx = { suppressed: new Set(["gone@x.com"]), inSequence: new Set(["seq1"]), now };

test("leads without consent are cold", () => assert.equal(pickLane({ consent_email: false }), "cold"));
test("lead-magnet consent and user opt-in are opted_in", () => {
  assert.equal(pickLane({ consent_email: true }), "opted_in");
  assert.equal(pickLane({ marketing_opt_in: true }), "opted_in");
});
test("account notices are transactional even for opted-in people", () => assert.equal(pickLane({ marketing_opt_in: true, purpose: "transactional" }), "transactional"));
test("cold lead through SendGrid is refused", () => assert.throws(() => assertLane("sendgrid", { email: "a@b.com" }), /cold lane/));
test("opted-in lead through a cold inbox is refused", () => assert.throws(() => assertLane("cold_inbox", { consent_email: true }), /opted_in lane/));
test("marketing through the account email queue is refused", () => assert.throws(() => assertLane("email_queue", { marketing_opt_in: true })));
test("matching lane passes", () => assert.equal(assertLane("cold_inbox", { email: "a@b.com" }), "cold"));

test("suppressed addresses are excluded, any case", () => assert.equal(exclusionReason({ email: "Gone@X.com" }, ctx), "suppressed"));
test("do_not_contact excluded", () => assert.equal(exclusionReason({ email: "a@b.com", do_not_contact: true }, ctx), "do_not_contact"));
test("not interested excluded", () => assert.equal(exclusionReason({ email: "a@b.com", stage: "not_interested" }, ctx), "not_interested"));
test("replied 29 days ago excluded, 31 days ago allowed", () => {
  assert.equal(exclusionReason({ email: "a@b.com", replied_at: new Date(now - 29 * 86400000).toISOString() }, ctx), "replied_recently");
  assert.equal(exclusionReason({ email: "a@b.com", replied_at: new Date(now - 31 * 86400000).toISOString() }, ctx), null);
});
test("active sequence excluded", () => assert.equal(exclusionReason({ id: "seq1", email: "a@b.com" }, ctx), "in_sequence"));
test("normal lead allowed", () => assert.equal(exclusionReason({ id: "x", email: "a@b.com", stage: "signed_up" }, ctx), null));

const inbox = { daily_limit: 30, warmup_daily_increase: 3, active: true };
test("no warm-up date uses the daily limit", () => assert.equal(inboxCapacity(inbox, "2026-11-11"), 30));
test("warm-up day 0 sends 5, day 4 sends 17", () => {
  assert.equal(inboxCapacity({ ...inbox, warmup_start_date: "2026-11-11" }, "2026-11-11"), 5);
  assert.equal(inboxCapacity({ ...inbox, warmup_start_date: "2026-11-07" }, "2026-11-11"), 17);
});
test("warm-up never exceeds daily limit", () => assert.equal(inboxCapacity({ ...inbox, warmup_start_date: "2026-01-01" }, "2026-11-11"), 30));
test("paused inbox has no capacity", () => assert.equal(inboxCapacity({ ...inbox, active: false }, "2026-11-11"), 0));

test("quiet hours: 9:00 New York Wednesday is open", () => assert.equal(coldWindowOpen(new Date("2026-11-11T14:00:00Z"), "MD"), true));
test("quiet hours: 8:00 New York is closed", () => assert.equal(coldWindowOpen(new Date("2026-11-11T13:00:00Z"), "NY"), false));
test("quiet hours: 17:30 is closed", () => assert.equal(coldWindowOpen(new Date("2026-11-11T22:30:00Z"), "NY"), false));
test("quiet hours: same instant, California still 6am so closed", () => assert.equal(coldWindowOpen(new Date("2026-11-11T14:00:00Z"), "CA"), false));
test("quiet hours: Saturday closed", () => assert.equal(coldWindowOpen(new Date("2026-11-14T15:00:00Z"), "NY"), false));

test("22 recipients over 5 days: 5 a day, last day gets 2", () => {
  const d = spreadDays(22, 5); assert.equal(d.filter((x) => x === 0).length, 5); assert.equal(d.filter((x) => x === 4).length, 2);
});
test("capacity cap pushes onto more days", () => assert.equal(Math.max(...spreadDays(22, 5, 3)), 7));
test("weekdays skip the weekend", () => assert.deepEqual(nextWeekdays(new Date("2026-11-13T12:00:00Z"), 3), ["2026-11-13", "2026-11-16", "2026-11-17"]));

test("merge fields use fallbacks", () => assert.equal(renderMerge("Hi {{first_name|there}} at {{business_name}}", { first_name: "" }), "Hi there at "));
test("cold body allows one link only", () => {
  assert.equal(coldBodyProblem("Try https://a.com", "https://u"), null);
  assert.match(coldBodyProblem("https://a.com and https://b.com") ?? "", /one link/);
  assert.match(coldBodyProblem("<p>hi</p>") ?? "", /plain text/);
});
