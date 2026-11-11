// Shop Partner Program rules. SQL mirrors: partner_slugify / partner_unique_code / partner_sync_user_pro / partner_revenue_report.
export const DEFAULT_BUY_OFFER_PCT = 60;
export const REVENUE_SHARE_MONTHS = 12;
export const FIRST_CUSTOMERS_GOAL = 10;
export const SHOP_MODE_KEY = "mca_shop_mode";

export function slugify(name: string): string {
  const s = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return s || "shop";
}

export function partnerCodeFor(name: string): string {
  const s = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
  return `shop_${s || "partner"}`;
}

/** Suggested buy offer: pct of market value, rounded down to the cent. */
export function buyOffer(marketValue: number | null | undefined, pct: number = DEFAULT_BUY_OFFER_PCT): number | null {
  const v = Number(marketValue);
  if (!Number.isFinite(v) || v <= 0 || !(pct > 0) || pct > 100) return null;
  return Math.floor(v * pct) / 100;
}

/** A payment counts toward revenue share only within 12 months of the customer's sign-up. */
export function withinRevenueWindow(signupAt: Date, paidAt: Date): boolean {
  const end = new Date(signupAt);
  end.setMonth(end.getMonth() + REVENUE_SHARE_MONTHS);
  return paidAt >= signupAt && paidAt < end;
}

export function revenueOwedCents(revenueCents: number, sharePct: number): number {
  if (!(sharePct > 0)) return 0;
  return Math.round((revenueCents * sharePct) / 100);
}

type Credits = { plan: string; billing_source: string | null; stripe_subscription_id: string | null };
/** What free staff Pro should do to a user's plan. Paid Stripe plans are never touched. */
export function staffProAction(onActiveShop: boolean, c: Credits): "grant" | "revoke" | "none" {
  if (c.stripe_subscription_id) return "none";
  if (onActiveShop) return c.plan === "pro" ? "none" : "grant";
  return c.billing_source === "partner" ? "revoke" : "none";
}

export type ShopMode = { shopId: string; shopName: string; pct: number };
export function readShopMode(): ShopMode | null {
  try { const v = JSON.parse(localStorage.getItem(SHOP_MODE_KEY) ?? "null"); return v?.shopId ? v : null; } catch { return null; }
}
export function writeShopMode(v: ShopMode | null) {
  try { v ? localStorage.setItem(SHOP_MODE_KEY, JSON.stringify(v)) : localStorage.removeItem(SHOP_MODE_KEY); } catch { /* blocked */ }
}

export const shopUrl = (slug: string) => `https://mycollectai.com/s/${slug}`;
