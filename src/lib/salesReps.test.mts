import { test } from "node:test";
import assert from "node:assert/strict";
import { territoryMatch, parseTerritories, pickRep, touches, commissionCents, voicemailFits, OUTCOME_EFFECT, reminderAt, isValidRefCode } from "./salesReps.ts";

test("state territory covers the whole state; county territory only that county", () => {
  assert.equal(territoryMatch(["MD"], "md", "Baltimore"), true);
  assert.equal(territoryMatch(["MD:Harford"], "MD", "Harford County"), true);
  assert.equal(territoryMatch(["MD:Harford"], "MD", "Cecil"), false);
  assert.equal(territoryMatch(["MD"], "PA", null), false);
  assert.equal(territoryMatch(["MD"], null, null), false);
});

test("territory input is cleaned", () => {
  assert.deepEqual(parseTerritories("md, MD:harford county; xx1"), ["MD", "MD:Harford"]);
});

test("round-robin picks the matching rep assigned longest ago, never-assigned first", () => {
  const reps = [
    { user_id: "a", active: true, territories: ["MD"], last_assigned_at: "2026-11-10T00:00:00Z", created_at: "2026-01-01" },
    { user_id: "b", active: true, territories: ["MD"], last_assigned_at: "2026-11-09T00:00:00Z", created_at: "2026-01-02" },
    { user_id: "c", active: false, territories: ["MD"], last_assigned_at: null, created_at: "2026-01-03" },
    { user_id: "d", active: true, territories: ["PA"], last_assigned_at: null, created_at: "2026-01-04" },
  ];
  assert.equal(pickRep(reps, "MD"), "b");
  assert.equal(pickRep([...reps, { user_id: "e", active: true, territories: ["MD"], last_assigned_at: null, created_at: "2026-02-01" }], "MD"), "e");
  assert.equal(pickRep(reps, "VA"), null);
});

test("touches count emails, calls and DMs", () => {
  assert.equal(touches({ emails: 30, calls: 15, dms: 5 }), 50);
});

test("commission is the rate percentage of revenue", () => {
  assert.equal(commissionCents(4999, 20), 1000);
  assert.equal(commissionCents(10000, 0), 0);
});

test("voicemail must be under 25 seconds", () => {
  assert.equal(voicemailFits("word ".repeat(62)), true);
  assert.equal(voicemailFits("word ".repeat(70)), false);
});

test("call outcomes: interested stops the sequence, do not contact stops and marks stage, no answer continues", () => {
  assert.equal(OUTCOME_EFFECT.interested.sequence, "stop");
  assert.equal(OUTCOME_EFFECT.do_not_contact.stage, "do_not_contact");
  assert.equal(OUTCOME_EFFECT.no_answer.sequence, "continue");
});

test("reminder goes the day before, and not when that's already past", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  assert.equal(reminderAt(new Date("2026-11-14T15:00:00Z"), now)?.toISOString(), "2026-11-13T15:00:00.000Z");
  assert.equal(reminderAt(new Date("2026-11-12T10:00:00Z"), now), null);
});

test("ref codes are lowercase letters, numbers, _ or -", () => {
  assert.equal(isValidRefCode("rep_simon"), true);
  assert.equal(isValidRefCode("Rep Simon"), false);
});

test("the default voicemail is under 25 seconds", async () => {
  const { voicemailScript } = await import("../components/reps/repScripts.ts");
  assert.equal(voicemailFits(voicemailScript({ first: "Alexandra", rep: "Jamie", phone: "410-555-0100" })), true);
});
