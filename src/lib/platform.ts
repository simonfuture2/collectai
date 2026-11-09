import { Capacitor } from "@capacitor/core";

type Cap = { isNativePlatform: () => boolean; getPlatform: () => string };

/** True only inside the installed Android app (not the website, not iOS). */
export function isAndroidApp(cap: Cap = Capacitor): boolean {
  return cap.isNativePlatform() && cap.getPlatform() === "android";
}

/** Paths that are website-only (crypto marketplace & wallets). */
export function isMarketplacePath(pathname: string): boolean {
  return pathname === "/marketplace" || pathname.startsWith("/marketplace/") || pathname === "/wallets" || pathname.startsWith("/wallets/");
}

export const ANDROID_PLANS_MSG = "Plans are coming soon to the Android app.";
export const ANDROID_OUT_OF_CREDITS_MSG = "You're out of credits for full analysis. Free price checks are still available.";
export const ANDROID_NO_MARKET_MSG = "The marketplace isn't available in the Android app.";
