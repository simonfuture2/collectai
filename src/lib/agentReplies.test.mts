import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { ATTENTION_INTENTS, countedRecentReply, gmailReplyUrl, needsReplyAttention, newestRepliedLeads, sevenDaysAgo } from "./agentReplies";

const now = Date.parse("2026-10-19T03:06:00Z");
describe("Agent HQ reply rules", () => {
  test("attention covers only interested and question within the last 7 days", () => {
    assert.deepEqual(ATTENTION_INTENTS, ["interested", "question"]);
    assert.equal(sevenDaysAgo(now), "2026-10-12T03:06:00.000Z");
    for (const reply_intent of ATTENTION_INTENTS) {
      assert.equal(needsReplyAttention({ reply_intent, replied_at: "2026-10-12T03:06:00Z" }, now), true);
      assert.equal(needsReplyAttention({ reply_intent, replied_at: "2026-10-12T03:05:59Z" }, now), false);
    }
    for (const reply_intent of ["not_interested", "remove_me", "auto_reply", null]) {
      assert.equal(needsReplyAttention({ reply_intent, replied_at: "2026-10-19T03:00:00Z" }, now), false);
    }
    assert.equal(needsReplyAttention({ reply_intent: "interested", replied_at: null }, now), false);
  });
  test("Replies contains only replied leads ordered by newest reply", () => {
    assert.deepEqual(newestRepliedLeads([
      { id: "old", replied_at: "2026-09-01T00:00:00Z" },
      { id: "none", replied_at: null },
      { id: "new", replied_at: "2026-10-19T00:00:00Z" },
    ]).map((l) => l.id), ["new", "old"]);
  });
  test("7-day reply totals exclude auto replies but include null intents", () => {
    assert.equal(countedRecentReply({ intent: "auto_reply", received_at: "2026-10-19T00:00:00Z" }, now), false);
    assert.equal(countedRecentReply({ intent: null, received_at: "2026-10-12T03:06:00Z" }, now), true);
    assert.equal(countedRecentReply({ intent: "interested", received_at: "2026-10-12T03:05:59Z" }, now), false);
  });
  test("Gmail searches for the lead email safely", () => {
    assert.equal(gmailReplyUrl("shop+cards@example.com"), "https://mail.google.com/mail/u/0/#search/from:shop%2Bcards%40example.com");
  });
});