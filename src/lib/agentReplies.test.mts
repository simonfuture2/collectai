import { describe, expect, test } from "bun:test";
import { ATTENTION_INTENTS, countedRecentReply, gmailReplyUrl, needsReplyAttention, newestRepliedLeads, sevenDaysAgo } from "./agentReplies";

const now = Date.parse("2026-10-19T03:06:00Z");
describe("Agent HQ reply rules", () => {
  test("attention covers only interested and question within the last 7 days", () => {
    expect(ATTENTION_INTENTS).toEqual(["interested", "question"]);
    expect(sevenDaysAgo(now)).toBe("2026-10-12T03:06:00.000Z");
    for (const reply_intent of ATTENTION_INTENTS) {
      expect(needsReplyAttention({ reply_intent, replied_at: "2026-10-12T03:06:00Z" }, now)).toBe(true);
      expect(needsReplyAttention({ reply_intent, replied_at: "2026-10-12T03:05:59Z" }, now)).toBe(false);
    }
    for (const reply_intent of ["not_interested", "remove_me", "auto_reply", null]) {
      expect(needsReplyAttention({ reply_intent, replied_at: "2026-10-19T03:00:00Z" }, now)).toBe(false);
    }
    expect(needsReplyAttention({ reply_intent: "interested", replied_at: null }, now)).toBe(false);
  });
  test("Replies contains only replied leads ordered by newest reply", () => {
    expect(newestRepliedLeads([
      { id: "old", replied_at: "2026-09-01T00:00:00Z" },
      { id: "none", replied_at: null },
      { id: "new", replied_at: "2026-10-19T00:00:00Z" },
    ]).map((l) => l.id)).toEqual(["new", "old"]);
  });
  test("7-day reply totals exclude auto replies but include null intents", () => {
    expect(countedRecentReply({ intent: "auto_reply", received_at: "2026-10-19T00:00:00Z" }, now)).toBe(false);
    expect(countedRecentReply({ intent: null, received_at: "2026-10-12T03:06:00Z" }, now)).toBe(true);
    expect(countedRecentReply({ intent: "interested", received_at: "2026-10-12T03:05:59Z" }, now)).toBe(false);
  });
  test("Gmail searches for the lead email safely", () => {
    expect(gmailReplyUrl("shop+cards@example.com")).toBe("https://mail.google.com/mail/u/0/#search/from:shop%2Bcards%40example.com");
  });
});