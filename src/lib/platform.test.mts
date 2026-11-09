import { test } from "node:test";
import assert from "node:assert/strict";
import { isAndroidApp, isMarketplacePath } from "./platform.ts";

const cap = (native: boolean, p: string) => ({ isNativePlatform: () => native, getPlatform: () => p });

test("android app only when native android", () => {
  assert.equal(isAndroidApp(cap(true, "android")), true);
  assert.equal(isAndroidApp(cap(false, "web")), false);
  assert.equal(isAndroidApp(cap(true, "ios")), false);
});

test("marketplace and wallet paths are website-only", () => {
  assert.equal(isMarketplacePath("/marketplace"), true);
  assert.equal(isMarketplacePath("/marketplace/list/abc"), true);
  assert.equal(isMarketplacePath("/wallets"), true);
  assert.equal(isMarketplacePath("/collection"), false);
});
