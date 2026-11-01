import { test } from "node:test";
import assert from "node:assert/strict";
import { PRICE_ONLY_UPGRADE_CREDITS } from "./rules.ts";
test("server-side price-only upgrades cost exactly one credit", () => assert.equal(PRICE_ONLY_UPGRADE_CREDITS, 1));