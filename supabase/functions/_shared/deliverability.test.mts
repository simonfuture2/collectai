import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxPauseReason, broadcastPauseReason, coldDomainProblem, isMondayEightET, trend, toCsv, sendgridSuppressReason, adviseDns } from "./deliverability.ts";

test("inbox pauses above 3% bounces, not at 3%", () => {
  assert.equal(inboxPauseReason({ sends: 100, bounces: 3, complaints: 0 }), null);
  assert.match(inboxPauseReason({ sends: 100, bounces: 4, complaints: 0 })!, /Bounce rate 4.0%/);
});
test("one complaint pauses an inbox", () => {
  assert.match(inboxPauseReason({ sends: 500, bounces: 0, complaints: 1 })!, /complaint/);
});
test("broadcasts pause above 0.1% spam", () => {
  assert.equal(broadcastPauseReason({ delivered: 1000, spam: 1 }), null);
  assert.ok(broadcastPauseReason({ delivered: 1000, spam: 2 }));
  assert.equal(broadcastPauseReason({ delivered: 10, spam: 0 }), null);
});
test("cold inboxes never on mycollectai.com", () => {
  assert.ok(coldDomainProblem("mycollectai.com"));
  assert.ok(coldDomainProblem("mail.mycollectai.com"));
  assert.equal(coldDomainProblem("getmycollectai.com"), null);
});
test("weekly summary fires Monday 8 ET in winter and summer", () => {
  assert.equal(isMondayEightET(new Date("2026-11-16T13:00:00Z")), true);
  assert.equal(isMondayEightET(new Date("2026-11-16T12:00:00Z")), false);
  assert.equal(isMondayEightET(new Date("2026-07-13T12:00:00Z")), true);
  assert.equal(isMondayEightET(new Date("2026-11-17T13:00:00Z")), false);
});
test("trend and csv", () => {
  assert.deepEqual(trend(12, 10), { dir: "up", pct: 20 });
  assert.equal(trend(0, 5).dir, "down");
  assert.equal(toCsv([{ a: "x,y", b: 1 }]), 'a,b\n"x,y",1');
});
test("sendgrid events that suppress", () => {
  assert.equal(sendgridSuppressReason({ event: "spamreport" }), "complaint");
  assert.equal(sendgridSuppressReason({ event: "bounce", type: "bounce" }), "bounced");
  assert.equal(sendgridSuppressReason({ event: "bounce", type: "blocked" }), null);
  assert.equal(sendgridSuppressReason({ event: "delivered" }), null);
});
test("dns advice", () => {
  const a = adviseDns({ spf: "v=spf1 include:_spf.google.com ~all", dmarc: null, dkimSelectors: ["google"], mx: true });
  assert.equal(a.spf, "ok"); assert.equal(a.dmarc, "missing"); assert.equal(a.fixes.length, 1);
});
