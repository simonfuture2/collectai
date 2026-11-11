import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, partnerCodeFor, buyOffer, withinRevenueWindow, revenueOwedCents, staffProAction } from "./partnerShops.ts";

test("slug and partner code from shop name", () => {
  assert.equal(slugify("Bel Air Cards"), "bel-air-cards");
  assert.equal(slugify("  !!! "), "shop");
  assert.equal(partnerCodeFor("Bel Air Cards"), "shop_belaircards");
});

test("buy offer defaults to 60% of market value", () => {
  assert.equal(buyOffer(100), 60);
  assert.equal(buyOffer(12.5, 70), 8.75);
  assert.equal(buyOffer(0), null);
});

test("revenue share only counts the first 12 months", () => {
  const s = new Date("2026-01-15T00:00:00Z");
  assert.equal(withinRevenueWindow(s, new Date("2026-12-01T00:00:00Z")), true);
  assert.equal(withinRevenueWindow(s, new Date("2027-02-01T00:00:00Z")), false);
});

test("revenue share default 0 means nothing owed", () => {
  assert.equal(revenueOwedCents(10000, 0), 0);
  assert.equal(revenueOwedCents(10000, 15), 1500);
});

test("staff Pro never touches a Stripe plan", () => {
  assert.equal(staffProAction(true, { plan: "free", billing_source: null, stripe_subscription_id: null }), "grant");
  assert.equal(staffProAction(false, { plan: "pro", billing_source: "partner", stripe_subscription_id: null }), "revoke");
  assert.equal(staffProAction(false, { plan: "pro", billing_source: null, stripe_subscription_id: "sub_1" }), "none");
  assert.equal(staffProAction(false, { plan: "pro", billing_source: null, stripe_subscription_id: null }), "none");
});
