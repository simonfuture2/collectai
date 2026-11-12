import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRawEmail, failedRecipient, isAutoReply, isBounceNotice, bounceKind, splitAddress } from "./gmailRules.ts";

const dec = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

test("message is plain text with unsubscribe headers", () => {
  const m = dec(buildRawEmail({ from: "Simon <s@x.com>", to: "a@b.com", subject: "Hi", body: "Hello", unsubscribeUrl: "https://u/1" }));
  assert.match(m, /Content-Type: text\/plain/);
  assert.match(m, /List-Unsubscribe: <https:\/\/u\/1>/);
  assert.match(m, /From: Simon <s@x.com>/);
});
test("non-ASCII subject is encoded", () => assert.match(dec(buildRawEmail({ from: "s@x.com", to: "a@b.com", subject: "Pokémon", body: "x" })), /Subject: =\?UTF-8\?B\?/));
test("header injection is stripped", () => assert.doesNotMatch(dec(buildRawEmail({ from: "s@x.com", to: "a@b.com", subject: "Hi\r\nBcc: z@z.com", body: "x" })), /\r\nBcc:/));
test("splits display name", () => assert.deepEqual(splitAddress("Simon <S@X.com>"), { name: "Simon", email: "s@x.com" }));

test("Gmail bounce is detected and recipient read", () => {
  const hs = { from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", "x-failed-recipients": "nobody@shop.com" };
  assert.equal(isBounceNotice(hs), true);
  assert.equal(failedRecipient(hs, ""), "nobody@shop.com");
});
test("recipient from DSN body", () => assert.equal(failedRecipient({}, "Final-Recipient: rfc822; gone@shop.com\n"), "gone@shop.com"));
test("never returns own address or a guess", () => {
  assert.equal(failedRecipient({}, "Your message wasn't delivered to me@mine.com", "me@mine.com"), null);
  assert.equal(failedRecipient({}, "something went wrong"), null);
});
test("normal reply is not a bounce", () => assert.equal(isBounceNotice({ from: "Joe <joe@shop.com>", subject: "Re: cards" }), false));
test("out of office is an auto-reply", () => {
  assert.equal(isAutoReply({ subject: "Out of Office: back Monday" }), true);
  assert.equal(isAutoReply({ "auto-submitted": "auto-replied" }), true);
  assert.equal(isAutoReply({ subject: "Re: cards", "auto-submitted": "no" }), false);
});
test("spam report is a complaint", () => assert.equal(bounceKind({ "content-type": "multipart/report; report-type=feedback-report" }, "Feedback-Type: abuse"), "complaint"));
