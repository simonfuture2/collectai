import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionFromHash, visibleSections, LEGACY_ADMIN_PATHS } from "./adminSections";

const both = { isAdmin: true, isAgentAdmin: true };
const agentOnly = { isAdmin: false, isAgentAdmin: true };
const adminOnly = { isAdmin: true, isAgentAdmin: false };

test("hash opens its own section", () => {
  assert.equal(sectionFromHash("#users", both), "users");
  assert.equal(sectionFromHash("#inbox", both), "inbox");
});
test("empty hash lands on Overview", () => assert.equal(sectionFromHash("", both), "overview"));
test("old tab names still work", () => {
  assert.equal(sectionFromHash("#queue", both), "inbox");
  assert.equal(sectionFromHash("#pc-purge", both), "pc-data");
});
test("/admin/agent redirects to the inbox", () => assert.equal(LEGACY_ADMIN_PATHS["/admin/agent"], "/admin#inbox"));
test("agent-only admins cannot open user sections", () => {
  assert.equal(sectionFromHash("#users", agentOnly), "overview");
  assert.ok(!visibleSections(agentOnly).some((s) => s.id === "transactions"));
});
test("app admins without agent access don't see the inbox", () => {
  assert.equal(sectionFromHash("#inbox", adminOnly), "overview");
});
test("nobody sees nothing", () => assert.equal(visibleSections({ isAdmin: false, isAgentAdmin: false }).length, 0));
test("sales reps alone see no admin sections", () => {
  assert.equal(visibleSections({ isAdmin: false, isAgentAdmin: false }).some((s) => s.id === "reps"), false);
});
