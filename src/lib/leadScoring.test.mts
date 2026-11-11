import { test } from "node:test";
import assert from "node:assert/strict";
import { fitScore, radiusMeters, placesCostEstimate, shouldRetryEnrich, emailsInText, referrerReward, friendRewardDue } from "./leadScoring.ts";

test("each signal adds its points", () => {
  assert.equal(fitScore({ buysCards: true }), 25);
  assert.equal(fitScore({ tcgFocus: true }), 20);
  assert.equal(fitScore({ sports: true }), 10);
  assert.equal(fitScore({ otherCollectibles: true }), 5);
  assert.equal(fitScore({ activeSocial: true }), 10);
  assert.equal(fitScore({ events: true }), 10);
  assert.equal(fitScore({ publicEmail: true }), 15);
  assert.equal(fitScore({ onlineStore: true }), 10);
});
test("creator with 5k+ followers gets +15, under 5k gets nothing", () => {
  assert.equal(fitScore({ leadType: "creator", followers: 5000 }), 15);
  assert.equal(fitScore({ leadType: "creator", followers: 4999 }), 0);
  assert.equal(fitScore({ leadType: "card_shop", followers: 90000 }), 0);
});
test("score caps at 100", () => {
  assert.equal(fitScore({ buysCards: true, tcgFocus: true, sports: true, otherCollectibles: true, activeSocial: true, events: true, publicEmail: true, onlineStore: true, leadType: "creator", followers: 1e6 }), 100);
});
test("radius stays 5–30 miles and inside Google's 50 km", () => {
  assert.equal(radiusMeters(25), 40234);
  assert.equal(radiusMeters(100), 48280);
  assert.equal(radiusMeters(1), 8047);
});
test("cost estimate is cities × terms searches", () => {
  assert.deepEqual(placesCostEstimate(1, 6), { searches: 6, usd: 0.21 });
});
test("enrichment retried at most twice", () => {
  assert.equal(shouldRetryEnrich(0, "pending"), true);
  assert.equal(shouldRetryEnrich(2, "failed"), true);
  assert.equal(shouldRetryEnrich(3, "failed"), false);
  assert.equal(shouldRetryEnrich(0, "done"), false);
});
test("emails only come from the page text, junk dropped", () => {
  assert.deepEqual(emailsInText("Contact: Info@Shop.com or img@2x.png, sentry@sentry.io"), ["info@shop.com"]);
  assert.deepEqual(emailsInText("no email here"), []);
});
test("referrer capped at 30 credits a month", () => {
  assert.equal(referrerReward(0), 3);
  assert.equal(referrerReward(28), 2);
  assert.equal(referrerReward(30), 0);
});
test("friend gets credits only after 5 price checks, once", () => {
  assert.equal(friendRewardDue(4, false), false);
  assert.equal(friendRewardDue(5, false), true);
  assert.equal(friendRewardDue(9, true), false);
});
